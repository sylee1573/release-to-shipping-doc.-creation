from fastapi import Depends, HTTPException, status

from middleware.auth import get_current_user
from models.tenant import Tenant
from models.user import User
from database import get_db
from sqlalchemy.ext.asyncio import AsyncSession


async def require_active_tenant(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    모든 비즈니스 API에 적용.
    테넌트 is_active == False → 423 Locked (미납 서비스 중단).
    """
    if user.is_superadmin:
        return user

    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="고객사 정보를 찾을 수 없습니다")

    if not tenant.is_active:
        raise HTTPException(
            status_code=423,
            detail={
                "code": "SERVICE_SUSPENDED",
                "message": "미납으로 인해 서비스가 중단되었습니다. 납부 확인 후 복구됩니다.",
                "suspended_at": str(tenant.suspended_at),
            },
        )
    return user
