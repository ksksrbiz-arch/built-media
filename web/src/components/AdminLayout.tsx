import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { api, type MeResponse } from '../lib/api';

/**
 * Wraps admin pages. Loads /api/me, gates on `profile.is_admin`, and renders
 * a mobile-first chrome with a sticky bottom tab bar (≥ md it floats off to
 * the side as a regular nav).
 */
export default function AdminLayout() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    let active = true;
    void api.me()
      .then((data) => {
        if (!active) return;
        if (!data.profile?.is_admin) {
          setForbidden(true);
        } else {
          setMe(data);
        }
      })
      .catch(() => {
        if (active) setForbidden(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && forbidden) {
      const t = setTimeout(() => nav('/dashboard', { replace: true }), 1500);
      return () => clearTimeout(t);
    }
  }, [loading, forbidden, nav]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-navy-300">Loading admin…</div>
    );
  }
  if (forbidden || !me) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="card text-center">
          <h2 className="font-display text-xl font-bold mb-2">Admin access required</h2>
          <p className="text-navy-300 text-sm">
            Your account does not have administrator privileges. Redirecting…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-10">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
              Admin console
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">Operate Built Media</h1>
          </div>
          <span className="badge bg-gold-500/10 text-gold-300 border border-gold-500/30">
            {me.user.email}
          </span>
        </div>

        {/* Desktop tab bar — visible on ≥ md */}
        <nav className="hidden md:flex items-center gap-1 mb-6 border-b border-navy-800">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `px-4 py-2 text-sm border-b-2 transition ${
                  isActive
                    ? 'border-gold-400 text-white'
                    : 'border-transparent text-navy-300 hover:text-white'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        <Outlet />
      </div>

      {/* Mobile bottom tab bar — visible on < md, thumb-reachable */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-navy-950/95 backdrop-blur border-t border-navy-800 pb-[env(safe-area-inset-bottom)]"
        aria-label="Admin sections"
      >
        <ul className="grid grid-cols-4">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] text-[11px] font-medium transition ${
                    isActive ? 'text-gold-400' : 'text-navy-300 hover:text-white'
                  }`
                }
              >
                <span aria-hidden className="text-base leading-none">{t.icon}</span>
                <span>{t.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

const TABS = [
  { to: '/admin', end: true, label: 'Overview', icon: '◎' },
  { to: '/admin/users', end: false, label: 'Users', icon: '☺' },
  { to: '/admin/clips', end: false, label: 'Clips', icon: '▶' },
  { to: '/admin/system', end: false, label: 'System', icon: '⚙' },
];
