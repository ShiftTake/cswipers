import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error caught by ErrorBoundary:', error, info);
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 bg-black text-white px-6 text-center">
          <p className="text-lg font-bold">Something went wrong.</p>
          <p className="max-w-md text-sm text-white/60">
            {this.state.error?.message || 'An unexpected error occurred while loading CardSwipers.'}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-2 rounded-xl bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C]"
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
