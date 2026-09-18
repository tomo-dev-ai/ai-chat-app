import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BrowserRouter, Routes, Route } from 'react-router'

import Layout from './Layout.tsx'
import App from './App.tsx'
import StructuredTest from './StructuredTest.tsx'
import Test from './Test.tsx'
import TanStackQueryTest from './TanStackQueryTest.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<App />} />
          <Route path="/structured" element={<StructuredTest />} />
          <Route path="/test" element={<Test />} />
          <Route path="/tanstack" element={<TanStackQueryTest />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)