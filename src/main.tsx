import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// ★ 追加：StructuredTest を読み込む
import App from './App.tsx'
import StructuredTest from './StructuredTest.tsx'
import Test from './Test.tsx'
import TanStackQueryTest from './TanStackQueryTest.tsx'

// ★ 今は TanStackQueryTest を表示している。必要に応じて切り替える
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* <App /> */}
    {/* <StructuredTest /> ← これを有効にすると JSONテスト画面になる */}
    {/* <Test /> */}
    <TanStackQueryTest />
  </StrictMode>,
)
