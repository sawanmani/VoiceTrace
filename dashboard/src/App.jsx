import { Outlet } from 'react-router-dom'
import Navbar from './components/Navbar'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <div className="app">
        <Navbar />
        <Outlet />
      </div>
    </ErrorBoundary>
  )
}
