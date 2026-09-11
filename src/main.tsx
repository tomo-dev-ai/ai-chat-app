import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// ★ 追加：StructuredTest を読み込む
import App from './App.tsx'
import StructuredTest from './StructuredTest.tsx'

// ★ 今は App を表示しているが、必要に応じて切り替える
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* <StructuredTest /> ← これを有効にすると JSONテスト画面になる */}
  </StrictMode>,
)
