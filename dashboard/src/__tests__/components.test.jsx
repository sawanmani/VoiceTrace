import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import HeroSection from '../components/HeroSection';

describe('HeroSection Component', () => {
  it('renders without crashing', () => {
    render(
      <BrowserRouter>
        <HeroSection />
      </BrowserRouter>
    );
    expect(screen.getByText(/The Open-Source AI Voice Shield/i)).toBeInTheDocument();
  });
});
