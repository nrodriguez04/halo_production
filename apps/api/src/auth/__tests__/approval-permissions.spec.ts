import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../permissions.decorator';
import { PermissionsGuard } from '../permissions.guard';
import { AgentController } from '../../agent/agent.controller';
import { CommunicationsController } from '../../communications/communications.controller';
import { AutomationController } from '../../automation/automation.controller';

/**
 * Every route that lets something out of the building, or applies what an
 * agent decided, needs `deals:approve`. A route that loses its decorator
 * would otherwise go back to "any signed-in user" without a test noticing.
 */
const permissionsOf = (cls: { prototype: object }, method: string) =>
  Reflect.getMetadata(
    PERMISSIONS_KEY,
    (cls.prototype as Record<string, unknown>)[method],
  );

describe('approval routes', () => {
  it.each([
    [AgentController, 'approveAgentRun', 'deals:approve'],
    [AgentController, 'rejectAgentRun', 'deals:approve'],
    [CommunicationsController, 'approve', 'deals:approve'],
    [CommunicationsController, 'reject', 'deals:approve'],
    [AutomationController, 'approveRun', 'deals:approve'],
    [AutomationController, 'createRun', 'control_plane:write'],
    [AutomationController, 'completeRun', 'control_plane:write'],
  ])('%p.%s requires %s', (cls, method, permission) => {
    expect(permissionsOf(cls, method)).toEqual([permission]);
  });

  it.each([AgentController, CommunicationsController, AutomationController])(
    '%p runs the permissions guard',
    (cls) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, cls)).toContain(
        PermissionsGuard,
      );
    },
  );
});
