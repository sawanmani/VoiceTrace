import { Outlet } from 'react-router-dom'
import MainLayout from './components/MainLayout'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <MainLayout />
    </ErrorBoundary>
  )
}
