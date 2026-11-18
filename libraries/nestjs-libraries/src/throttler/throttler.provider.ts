import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  @Inject(OrganizationService)
  private readonly _organizationService: OrganizationService;

  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { org?: any }>();
    const { url, method } = req;
    if (method === 'POST' && url.includes('/public/v1/posts')) {
      // Orgs with a super admin user (our own accounts and their agents) are not rate limited.
      if (
        req.org?.id &&
        (await this._organizationService.hasSuperAdminUser(req.org.id))
      ) {
        return true;
      }
      return super.canActivate(context);
    }

    return true;
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    return (
      req.org.id + '_' + (req.url.indexOf('/posts') > -1 ? 'posts' : 'other')
    );
  }
}
