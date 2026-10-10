import React, { useState } from 'react';
import { getBinderCards, getCardValue } from './binderModel.mjs';

export default function BinderManager({ binders, selectedBinder, cards, busy, error, loading, onSelect, onSave, onAssign, onAdd }) {
  const [editing, setEditing] = useState('');
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const binderCards = getBinderCards(cards, selectedBinder, binders);
  const total = binderCards.reduce((sum, card) => sum + getCardValue(card), 0);
  const filtered = binderCards.filter((card) => `${card.name || card.title || ''} ${card.brand || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const money = (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <section className="space-y-4" aria-label="Binder inventory">
      <div className="flex flex-wrap items-end gap-3 border-b border-white/10 pb-4">
        <label className="min-w-0 flex-1 text-xs text-white/55">Active binder
          <select aria-label="Active binder" value={selectedBinder.id} disabled={Boolean(busy)} onChange={(event) => onSelect(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 text-base text-white">
            {binders.map((binder) => <option key={binder.id} value={binder.id}>{binder.name} ({getBinderCards(cards, binder, binders).length})</option>)}
          </select>
        </label>
        <button type="button" disabled={Boolean(busy)} onClick={() => { setEditing('create'); setName(''); }} className="min-h-11 rounded-lg border border-emerald-400/40 px-3 text-sm font-semibold text-emerald-300">New Binder</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => { setEditing('rename'); setName(selectedBinder.name); }} className="min-h-11 rounded-lg border border-white/15 px-3 text-sm">Rename</button>
      </div>
      {editing && <form className="flex flex-wrap gap-2" onSubmit={async (event) => { event.preventDefault(); if (await onSave(name, editing === 'rename' ? selectedBinder.id : null)) setEditing(''); }}>
        <input aria-label="Binder name" autoFocus required minLength={1} maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="Binder name" className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/20 bg-zinc-900 px-3 text-base" />
        <button type="submit" disabled={Boolean(busy) || !name.trim()} className="min-h-11 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-black disabled:opacity-50">{busy === 'save' ? 'Saving...' : 'Save'}</button>
        <button type="button" onClick={() => setEditing('')} className="min-h-11 px-3 text-sm text-white/65">Cancel</button>
      </form>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/60">{binderCards.length} cards <span className="ml-2 font-bold text-emerald-300">{money(total)}</span></p>
        <input type="search" aria-label="Search binder" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search binder" className="min-h-11 max-w-full rounded-lg border border-white/15 bg-zinc-900 px-3 text-base" />
      </div>
      {loading ? <p role="status" className="py-8 text-sm text-white/60">Loading inventory...</p> : !binderCards.length ? <div className="py-8 text-center"><p className="text-sm text-white/60">This binder is empty.</p><button type="button" onClick={onAdd} className="mt-3 min-h-11 rounded-lg bg-rose-600 px-4 text-sm font-bold">Add Card</button></div> : !filtered.length ? <p className="py-8 text-sm text-white/60">No matching cards.</p> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((card) => <article key={card.id} className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
            <div className="aspect-[5/7] bg-black/30 p-2">{card.imageFrontUrl || card.imageUrl ? <img src={card.imageFrontUrl || card.imageUrl} alt={card.name || card.title || 'Card'} className="h-full w-full object-contain" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} /> : <div className="flex h-full items-center justify-center text-xs text-white/40">No image</div>}</div>
            <div className="space-y-1.5 p-3">
              <h3 className="break-words text-sm font-semibold">{card.name || card.title || 'Card'}</h3>
              <p className="truncate text-xs text-white/50">{card.brand} {card.condition ? ` / ${card.condition}` : ''}</p>
              <p className="text-sm font-bold text-emerald-300">{money(getCardValue(card))}</p>
              <select aria-label={`Move ${card.name || card.title || 'card'} to binder`} disabled={Boolean(busy)} value={selectedBinder.id} onChange={(event) => onAssign(card.id, event.target.value)} className="min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-2 text-xs">
                {binders.map((binder) => <option key={binder.id} value={binder.id}>{binder.name}</option>)}
              </select>
            </div>
          </article>)}
        </div>
      )}
    </section>
  );
}