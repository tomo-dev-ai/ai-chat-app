import { lazy } from "react";
import { Routes, Route } from "react-router";

import Layout from "./Layout";
import App from "./App";

// トップページ(App)以外は、そのページを初めて開いたときに読み込む
const StructuredTest = lazy(() => import("./StructuredTest"));
const Test = lazy(() => import("./Test"));
const TanStackQueryTest = lazy(() => import("./TanStackQueryTest"));

// アプリ全体のルーティング(どのURLでどのページを表示するか)
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<App />} />
        <Route path="/structured" element={<StructuredTest />} />
        <Route path="/test" element={<Test />} />
        <Route path="/tanstack" element={<TanStackQueryTest />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;