import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CartoKeyField from './CartoKeyField';

afterEach(cleanup);

describe('CartoKeyField without a key', () => {
  it('explains that the basemap needs a free key and links to the page that gives one', () => {
    render(<CartoKeyField apiKey="" onSave={vi.fn()} />);
    expect(screen.getByText(/clé API gratuite/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Obtenir une clé gratuite' });
    expect(link.getAttribute('href')).toBe('https://carto.com/basemaps/apikey');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('saves the pasted key without the spaces around it', () => {
    const onSave = vi.fn();
    render(<CartoKeyField apiKey="" onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Clé API CARTO'), { target: { value: '  abc123 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith('abc123');
  });

  it('cannot save an empty key', () => {
    render(<CartoKeyField apiKey="" onSave={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('CartoKeyField with a key', () => {
  it('only says the key is saved, without showing it', () => {
    render(<CartoKeyField apiKey="abc123" onSave={vi.fn()} />);
    expect(screen.getByText('Fond de carte CARTO : clé enregistrée')).toBeTruthy();
    expect(screen.queryByLabelText('Clé API CARTO')).toBeNull();
  });

  it('edits the saved key', () => {
    const onSave = vi.fn();
    render(<CartoKeyField apiKey="abc123" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    const input = screen.getByLabelText('Clé API CARTO') as HTMLInputElement;
    expect(input.value).toBe('abc123');
    fireEvent.change(input, { target: { value: 'def456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith('def456');
  });

  it('removes the key when it is cleared and saved', () => {
    const onSave = vi.fn();
    render(<CartoKeyField apiKey="abc123" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Clé API CARTO'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith('');
  });

  it('cancels an edit without saving', () => {
    const onSave = vi.fn();
    render(<CartoKeyField apiKey="abc123" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Clé API CARTO'), { target: { value: 'def456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Fond de carte CARTO : clé enregistrée')).toBeTruthy();
  });
});

describe('CartoKeyField when the build provides a key', () => {
  it('does not ask the user for a key', () => {
    const { container } = render(<CartoKeyField apiKey="" hasBuiltInKey onSave={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('still lets the user change the own key they saved', () => {
    render(<CartoKeyField apiKey="abc123" hasBuiltInKey onSave={vi.fn()} />);
    expect(screen.getByText('Fond de carte CARTO : clé enregistrée')).toBeTruthy();
  });
});
