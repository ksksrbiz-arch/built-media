import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useSession, supabase } from '../lib/supabase';

export default function Layout() {
  const { session } = useSession();
  const nav = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    nav('/');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-navy-800/80 bg-navy-950/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 grid place-items-center font-display font-bold text-navy-900">
              B
            </div>
            <span className="font-display font-semibold text-lg group-hover:text-gold-400 transition">
              Built Media
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {session ? (
              <>
                <Link to="/dashboard" className="btn-ghost">Dashboard</Link>
                <Link to="/pricing" className="btn-ghost">Plans</Link>
                <Link to="/settings" className="btn-ghost">Settings</Link>
                <button onClick={signOut} className="btn-ghost">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/pricing" className="btn-ghost">Pricing</Link>
                <Link to="/auth" className="btn-primary">Sign in</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-navy-800/80 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-navy-400">
          <span>© {new Date().getFullYear()} Built Media — a 1Commerce LLC product</span>
          <div className="flex gap-4">
            <Link to="/pricing" className="hover:text-white">Pricing</Link>
            <a href="https://1commerce.online" target="_blank" rel="noreferrer" className="hover:text-white">1Commerce</a>
            <a href="mailto:hello@1commerce.online" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
