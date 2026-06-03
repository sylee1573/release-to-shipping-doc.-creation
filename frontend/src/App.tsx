import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import OrderUpload from './pages/OrderUpload'
import ParseReview from './pages/ParseReview'
import ProductionList from './pages/ProductionList'
import ShipmentDocs from './pages/ShipmentDocs'
import Admin from './pages/Admin'
import Suspended from './components/Suspended'
import LandingPage from './pages/LandingPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/suspended" element={<Suspended />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="orders/upload" element={<OrderUpload />} />
          <Route path="orders/:id/review" element={<ParseReview />} />
          <Route path="production" element={<ProductionList />} />
          <Route path="shipment" element={<ShipmentDocs />} />
          <Route path="admin" element={<Admin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
