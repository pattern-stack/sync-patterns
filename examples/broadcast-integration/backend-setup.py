"""
Backend Setup for Broadcast Integration

This file demonstrates how to configure a FastAPI backend with
the WebSocket broadcast system from backend-patterns.

Key components:
1. WebSocketBroadcastBackend - Manages WebSocket connections and broadcasting
2. FastAPI router inclusion - Adds /ws/broadcast endpoint
3. Service layer integration - Broadcast events after mutations
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

# backend-patterns imports
from pattern_stack.atoms.broadcast import WebSocketBroadcastBackend
from pattern_stack.atoms.data import get_db_session

# =============================================================================
# Broadcast Backend Configuration
# =============================================================================


@lru_cache
def get_broadcast_backend() -> WebSocketBroadcastBackend:
    """Get the singleton broadcast backend.

    This creates a single WebSocketBroadcastBackend instance that manages
    all WebSocket connections. The @lru_cache ensures we get the same
    instance across the application.

    Returns:
        WebSocketBroadcastBackend: The broadcast backend singleton
    """
    return WebSocketBroadcastBackend()


# Type alias for dependency injection
BroadcastDep = Annotated[WebSocketBroadcastBackend, Depends(get_broadcast_backend)]

# =============================================================================
# Application Setup
# =============================================================================


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    This sets up:
    1. The FastAPI app instance
    2. WebSocket broadcast router at /ws/broadcast
    3. API routers for your endpoints

    Returns:
        FastAPI: Configured application instance
    """
    app = FastAPI(
        title="Broadcast Integration Example",
        description="Example backend with WebSocket broadcast support",
        version="1.0.0",
    )

    # Get the broadcast backend
    broadcast = get_broadcast_backend()

    # Include the WebSocket router
    # This adds the endpoint: /ws/broadcast
    app.include_router(broadcast.get_router())

    # Include your API routers
    from .routers import orders  # Your order routes

    app.include_router(orders.router, prefix="/api")

    return app


# =============================================================================
# Schemas (typically in schemas.py)
# =============================================================================


class OrderItemCreate(BaseModel):
    """Schema for creating an order item."""

    name: str
    quantity: int = 1
    price: float


class OrderItemResponse(BaseModel):
    """Schema for order item response."""

    id: UUID
    name: str
    quantity: int
    price: float

    class Config:
        from_attributes = True


class OrderUpdate(BaseModel):
    """Schema for updating an order."""

    customer_name: str | None = None
    status: str | None = None


class OrderResponse(BaseModel):
    """Schema for order response."""

    id: UUID
    customer_name: str
    status: str
    items: list[OrderItemResponse]
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# =============================================================================
# Service Layer with Broadcast Integration
# =============================================================================


class OrderService:
    """Order service with broadcast integration.

    This service demonstrates the pattern for integrating broadcast
    into your business logic. After each mutation, we broadcast an
    event so other connected clients can refresh their data.
    """

    def __init__(
        self,
        db: AsyncSession,
        broadcast: WebSocketBroadcastBackend,
    ) -> None:
        """Initialize the order service.

        Args:
            db: Database session for queries
            broadcast: Broadcast backend for real-time updates
        """
        self.db = db
        self.broadcast = broadcast

    async def list_orders(self) -> list:
        """Get all orders.

        Returns:
            List of orders
        """
        # Your database query here
        result = await self.db.execute(...)
        return result.scalars().all()

    async def get_order(self, order_id: UUID):
        """Get a single order by ID.

        Args:
            order_id: The order UUID

        Returns:
            The order

        Raises:
            HTTPException: If order not found
        """
        order = await self.db.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        return order

    async def add_item(self, order_id: UUID, item: OrderItemCreate):
        """Add an item to an order.

        This demonstrates the broadcast pattern:
        1. Perform the mutation
        2. Commit to database
        3. Broadcast the event

        Args:
            order_id: The order to add to
            item: The item to add

        Returns:
            The created order item
        """
        # 1. Get the order
        order = await self.get_order(order_id)

        # 2. Create the item
        order_item = OrderItem(
            name=item.name,
            quantity=item.quantity,
            price=item.price,
            order_id=order_id,
        )
        self.db.add(order_item)
        await self.db.commit()
        await self.db.refresh(order_item)

        # 3. Broadcast to all connected clients
        await self.broadcast.broadcast(
            channel="order",
            event_type="item_added",
            payload={
                "entity_id": str(order_id),
                "item_id": str(order_item.id),
            },
        )

        return order_item

    async def update_order(self, order_id: UUID, data: OrderUpdate):
        """Update an order.

        Args:
            order_id: The order to update
            data: The update data

        Returns:
            The updated order
        """
        order = await self.get_order(order_id)

        # Apply updates
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(order, field, value)

        await self.db.commit()
        await self.db.refresh(order)

        # Broadcast the update
        await self.broadcast.broadcast(
            channel="order",
            event_type="updated",
            payload={"entity_id": str(order_id)},
        )

        return order

    async def delete_order(self, order_id: UUID) -> None:
        """Delete an order.

        Args:
            order_id: The order to delete
        """
        order = await self.get_order(order_id)
        await self.db.delete(order)
        await self.db.commit()

        # Broadcast the deletion
        await self.broadcast.broadcast(
            channel="order",
            event_type="deleted",
            payload={"entity_id": str(order_id)},
        )


# =============================================================================
# API Router
# =============================================================================

from fastapi import APIRouter

router = APIRouter(prefix="/orders", tags=["orders"])

# Type aliases for common dependencies
DbSession = Annotated[AsyncSession, Depends(get_db_session)]


def get_order_service(
    db: DbSession,
    broadcast: BroadcastDep,
) -> OrderService:
    """Create an OrderService with injected dependencies.

    Args:
        db: Database session
        broadcast: Broadcast backend

    Returns:
        Configured OrderService
    """
    return OrderService(db, broadcast)


OrderServiceDep = Annotated[OrderService, Depends(get_order_service)]


@router.get("/")
async def list_orders(service: OrderServiceDep) -> list[OrderResponse]:
    """Get all orders."""
    return await service.list_orders()


@router.get("/{order_id}")
async def get_order(
    order_id: UUID,
    service: OrderServiceDep,
) -> OrderResponse:
    """Get a single order."""
    return await service.get_order(order_id)


@router.post("/{order_id}/items")
async def add_order_item(
    order_id: UUID,
    item: OrderItemCreate,
    service: OrderServiceDep,
) -> OrderItemResponse:
    """Add an item to an order.

    This endpoint:
    1. Adds the item to the database
    2. Broadcasts 'item_added' event to all connected clients
    """
    return await service.add_item(order_id, item)


@router.patch("/{order_id}")
async def update_order(
    order_id: UUID,
    data: OrderUpdate,
    service: OrderServiceDep,
) -> OrderResponse:
    """Update an order.

    This endpoint:
    1. Updates the order in the database
    2. Broadcasts 'updated' event to all connected clients
    """
    return await service.update_order(order_id, data)


@router.delete("/{order_id}")
async def delete_order(
    order_id: UUID,
    service: OrderServiceDep,
) -> None:
    """Delete an order.

    This endpoint:
    1. Deletes the order from the database
    2. Broadcasts 'deleted' event to all connected clients
    """
    await service.delete_order(order_id)


# =============================================================================
# Advanced: Channel-based Broadcasting
# =============================================================================


class BroadcastChannels:
    """Centralized channel name constants.

    Using constants prevents typos and makes it easy to find
    all places where a channel is used.
    """

    ORDER = "order"
    CONTACT = "contact"
    PRODUCT = "product"
    INVENTORY = "inventory"


class BroadcastEvents:
    """Centralized event type constants."""

    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"
    ITEM_ADDED = "item_added"
    ITEM_REMOVED = "item_removed"
    STATUS_CHANGED = "status_changed"


# Usage in service:
# await self.broadcast.broadcast(
#     channel=BroadcastChannels.ORDER,
#     event_type=BroadcastEvents.ITEM_ADDED,
#     payload={"entity_id": str(order_id)},
# )


# =============================================================================
# Advanced: Broadcast Decorator Pattern
# =============================================================================


def broadcasts(channel: str, event_type: str):
    """Decorator to automatically broadcast after a method call.

    This is an advanced pattern for reducing boilerplate when
    you have many methods that need to broadcast.

    Usage:
        class OrderService:
            @broadcasts("order", "item_added")
            async def add_item(self, order_id: UUID, item: OrderItemCreate):
                # ... do the work ...
                return {"entity_id": str(order_id)}  # payload
    """
    from functools import wraps

    def decorator(func):
        @wraps(func)
        async def wrapper(self, *args, **kwargs):
            result = await func(self, *args, **kwargs)

            # If the method returns a dict with entity_id, use it as payload
            payload = result if isinstance(result, dict) else {}

            await self.broadcast.broadcast(
                channel=channel,
                event_type=event_type,
                payload=payload,
            )

            return result

        return wrapper

    return decorator


# =============================================================================
# Testing Helpers
# =============================================================================


async def test_broadcast_setup():
    """Example test for broadcast functionality.

    This shows how to test that broadcasts are being sent correctly.
    """
    from unittest.mock import AsyncMock

    # Create a mock broadcast backend
    mock_broadcast = AsyncMock(spec=WebSocketBroadcastBackend)
    mock_db = AsyncMock()

    # Create service with mock dependencies
    service = OrderService(db=mock_db, broadcast=mock_broadcast)

    # Call a method that should broadcast
    # await service.add_item(order_id, item)

    # Verify broadcast was called
    # mock_broadcast.broadcast.assert_called_once_with(
    #     channel="order",
    #     event_type="item_added",
    #     payload={"entity_id": str(order_id), "item_id": str(item_id)},
    # )


# =============================================================================
# Running the Application
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8000)
