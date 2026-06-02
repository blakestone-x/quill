// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import AmbientCockpit from './AmbientCockpit';

afterEach(cleanup);

describe('AmbientCockpit', () => {
  it('renders the toggle and opens the panel without crashing', () => {
    render(<AmbientCockpit />);
    const toggle = screen.getByLabelText('Toggle ambient cockpit');
    expect(toggle).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.getByText('Ambient cockpit')).toBeTruthy();
    expect(screen.getByText(/Transcript will appear here/)).toBeTruthy();
    expect(screen.getByText('Record')).toBeTruthy();
  });
});
