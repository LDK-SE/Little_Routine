import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuditLogService } from './services/audit-log.service';
import { DailyReconcileService } from './services/daily-reconcile.service';
import { AlertService } from './services/alert.service';
import { StockCheckService } from './services/stock-check.service';
import { PointsExpireService } from './services/points-expire.service';

@Global()
@Module({
  providers: [
    JwtAuthGuard,
    RolesGuard,
    AuditLogService,
    DailyReconcileService,
    AlertService,
    StockCheckService,
    PointsExpireService,
  ],
  exports: [
    JwtAuthGuard,
    RolesGuard,
    AuditLogService,
    DailyReconcileService,
    AlertService,
    StockCheckService,
    PointsExpireService,
  ],
})
export class CommonModule {}
