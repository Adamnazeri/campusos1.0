import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Icon } from '../lib/icons'
import { Button, Card } from '../lib/ui'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[CampusOS] Ralat paparan tidak dijangka / Unexpected render error:', error, errorInfo)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
          <Card className="w-full max-w-md p-6 text-center">
            <div className="inline-flex shrink-0 items-center justify-center text-danger">
              <Icon.alert width={22} height={22} />
            </div>
            <div className="mb-2 flex items-center justify-center gap-2">
              <Icon.logo width={22} height={22} />
              <span className="font-display text-base font-bold tracking-tight text-foreground">CampusOS</span>
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              Maaf, sesuatu tidak kena
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Berlaku gangguan paparan sementara. Data anda selamat. Sila muat semula halaman ini untuk meneruskan.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">
              Something went wrong while displaying this page. Your data is safe. Please reload the page to continue.
            </p>
            <div className="mt-6 flex justify-center">
              <Button variant="primary" size="md" onClick={this.handleReload}>
                Muat semula / Reload
              </Button>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
