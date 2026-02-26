import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Server, Play, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SERVICE_CATALOG, SERVICE_IDS } from '@skaha-orc/shared';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/deploy', label: 'Deploy All', icon: Play },
];

export function Sidebar() {
  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-light-blue text-congress-blue'
                  : 'text-neutral-gray hover:bg-gray-100 hover:text-gray-900',
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}

        <div className="pt-4 pb-2 px-3">
          <p className="text-xs font-semibold text-neutral-gray uppercase tracking-wider">
            Services
          </p>
        </div>

        {SERVICE_IDS.filter((id) => id !== 'haproxy').map((id) => {
          const def = SERVICE_CATALOG[id];
          return (
            <NavLink
              key={id}
              to={`/services/${id}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-light-blue text-congress-blue font-medium'
                    : 'text-neutral-gray hover:bg-gray-100 hover:text-gray-900',
                )
              }
            >
              <Server className="w-3.5 h-3.5" />
              {def.name}
            </NavLink>
          );
        })}

        <div className="pt-4 pb-2 px-3">
          <p className="text-xs font-semibold text-neutral-gray uppercase tracking-wider">
            Infrastructure
          </p>
        </div>

        <NavLink
          to="/haproxy"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-light-blue text-congress-blue font-medium'
                : 'text-neutral-gray hover:bg-gray-100 hover:text-gray-900',
            )
          }
        >
          <Network className="w-3.5 h-3.5" />
          HAProxy
        </NavLink>
      </nav>
    </aside>
  );
}
