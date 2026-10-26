import { useConnectionState } from '../hooks/useClaims';
import { TRANSPORT } from '../services/websocket';

const LABEL = { connected: 'Connected', connecting: 'Connecting…', reconnecting: 'Reconnecting…' };
const TITLE = {
  mock: 'Preview mode: updates are simulated in the browser',
  polling: 'Claim status refreshes automatically every few seconds',
  websocket: 'Claim status updates arrive instantly over a WebSocket',
};

export default function LiveIndicator() {
  const state = useConnectionState();
  return (
    <span
      className={`live live-${state}`}
      title={TITLE[TRANSPORT]}
    >
      <i /> {LABEL[state] || state}
    </span>
  );
}
