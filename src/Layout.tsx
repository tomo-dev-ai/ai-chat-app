import { Suspense } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import Header from "./Header";
import Footer from "./Footer";
import ErrorBoundary from "./ErrorBoundary";

const navItems = [
  { to: "/", label: "チャット" },
  { to: "/structured", label: "Structured" },
  { to: "/test", label: "Test" },
  { to: "/tanstack", label: "TanStack Query" },
];

function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex flex-1">
        <nav className="w-48 shrink-0 bg-gray-100 border-r border-gray-200 py-4">
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `block px-4 py-2 text-sm ${isActive
                      ? "bg-blue-100 text-blue-700 font-bold border-l-4 border-blue-500"
                      : "text-gray-600 hover:bg-gray-200"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 overflow-y-auto">
          {/* ページ移動(URLの変化)でエラー状態をリセットする */}
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<p className="p-6 text-gray-500">読み込み中...</p>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <Footer />
    </div>
  );
}

export default Layout;
