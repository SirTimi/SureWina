import { agentMock } from '@/lib/agent-mock';
import { recordPrizePayout } from '@/lib/prize-payout-ledger';

const WIRING_KEY = '__surewinaAgentFinanceAdjustmentWired';

type WindowWithFinanceWiring = Window & {
  [WIRING_KEY]?: boolean;
};

type FinanceInput = Parameters<typeof agentMock.logPrizePayment>[0];

export function wireAgentFinanceAdjustments() {
  if (typeof window === 'undefined') return;

  const win = window as WindowWithFinanceWiring;
  if (win[WIRING_KEY]) return;

  const original = agentMock.logPrizePayment.bind(agentMock);

  agentMock.logPrizePayment = async (input: FinanceInput) => {
    await original(input);
    recordPrizePayout(input);
  };

  win[WIRING_KEY] = true;
}
