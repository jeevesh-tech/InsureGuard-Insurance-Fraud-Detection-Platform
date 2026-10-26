
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  FileText,
  FilePlus2,
  Home,
  LogOut,
  ScrollText,
  ChartNoAxesCombined,
} from 'lucide-react';
import Logo from '../components/Logo';
import LiveIndicator from '../components/LiveIndicator';
import { useAuth } from '../hooks/useAuth';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/policy', label: 'My policy', icon: ScrollText },
  { to: '/claims', label: 'Claims', icon: FileText },
  { to: '/claims/new', label: 'New claim', icon: FilePlus2 },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Keep Claims highlighted on claim details, but not on New Claim.
  const linkClass = (base, to) => ({ isActive }) => {
    const active =
      to === '/claims'
        ? location.pathname.startsWith('/claims') &&
          location.pathname !== '/claims/new'
        : isActive;

    return `${base} ${active ? 'active' : ''}`;
  };

  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo light />

        <nav aria-label="Primary navigation">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={linkClass('nav-link', to)}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="me">
            <span className="avatar">{initials}</span>
            <span className="me-name">
              {user.name}
              <small>{user.email}</small>
            </span>
            <button
              className="icon-btn light"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-logo">
            <Logo />
          </div>
          <LiveIndicator />
          <button
            className="icon-btn topbar-logout"
            onClick={logout}
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="tabbar" aria-label="Mobile primary navigation">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={linkClass('tab', to)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
