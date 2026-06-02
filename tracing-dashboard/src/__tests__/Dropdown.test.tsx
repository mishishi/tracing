import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dropdown } from '../components/Dropdown';
import { Layers } from 'lucide-react';

const options = [
  { value: 'proj-a', label: '项目 A' },
  { value: 'proj-b', label: '项目 B' },
  { value: 'proj-c', label: '项目 C' },
];

describe('Dropdown', () => {
  it('renders placeholder when no value selected', () => {
    render(<Dropdown value="" options={options} onChange={() => {}} />);
    expect(screen.getByText('请选择')).toBeInTheDocument();
  });

  it('renders selected option label', () => {
    render(<Dropdown value="proj-a" options={options} onChange={() => {}} />);
    expect(screen.getByText('项目 A')).toBeInTheDocument();
  });

  it('opens options list on click', async () => {
    render(<Dropdown value="" options={options} onChange={() => {}} />);
    const trigger = screen.getByRole('button', { expanded: false });
    await userEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('项目 B')).toBeInTheDocument();
  });

  it('calls onChange and closes on option select', async () => {
    const onChange = vi.fn();
    render(<Dropdown value="" options={options} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    await userEvent.click(screen.getByText('项目 B'));
    expect(onChange).toHaveBeenCalledWith('proj-b');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape key', async () => {
    render(<Dropdown value="" options={options} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows check icon on selected option', async () => {
    render(<Dropdown value="proj-b" options={options} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('button'));
    const items = screen.getAllByRole('option');
    // Second item should be selected
    expect(items[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('renders custom icon when provided', () => {
    render(
      <Dropdown
        value=""
        options={options}
        onChange={() => {}}
        icon={<Layers data-testid="custom-icon" />}
      />
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('uses custom placeholder', () => {
    render(
      <Dropdown
        value=""
        options={options}
        placeholder="选择项目..."
        onChange={() => {}}
      />
    );
    expect(screen.getByText('选择项目...')).toBeInTheDocument();
  });
});
