import { formatDate, formatTime } from '../utils/format';

/** Customer-facing activity: only events that carry a plain-language title. */
export default function ActivityFeed({ events = [] }) {
  const list = events.filter((e) => e.title).reverse();
  return (
    <ul className="feed">
      {list.map((e, i) => (
        <li key={e.id} className={`feed-item ${i === 0 ? 'latest' : ''}`}>
          <span className="feed-dot" />
          <div>
            <div className="feed-title">{e.title}</div>
            {e.detail && <div className="feed-detail">{e.detail}</div>}
          </div>
          <time className="feed-time">{formatDate(e.at)}<br />{formatTime(e.at)}</time>
        </li>
      ))}
    </ul>
  );
}
