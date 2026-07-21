import { useState, useEffect } from 'react';
import { useBroadcast } from '../../contexts/BroadcastContext';
import { getEvents, saveEvent, deleteEvent } from '../../utils/db';
import { ImportDialog } from './ImportDialog';
import type { Event, Skier } from '../../types/broadcast';
import './StartListManager.css';

export function StartListManager() {
  const { setActiveSkier, state: { activeSkier } } = useBroadcast();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  
  // Basic load
  const loadEvents = async () => {
    try {
      const data = await getEvents();
      setEvents(data);
      if (data.length > 0 && !selectedEventId) {
        setSelectedEventId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load events:', err);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const handleCreateEvent = async () => {
    const name = prompt('Enter event name:');
    if (!name) return;
    const newEvent: Event = {
      id: crypto.randomUUID(),
      name,
      skiers: [],
    };
    await saveEvent(newEvent);
    await loadEvents();
    setSelectedEventId(newEvent.id);
  };

  const handleAddSkier = async () => {
    if (!selectedEvent) return;
    const name = prompt('Skier name:');
    if (!name) return;
    
    const newSkier: Skier = {
      id: crypto.randomUUID(),
      name,
      club: prompt('Club (optional):') || '',
      className: prompt('Class (optional):') || '',
      bib: prompt('Bib (optional):') || '',
    };

    const updatedEvent = {
      ...selectedEvent,
      skiers: [...selectedEvent.skiers, newSkier]
    };

    await saveEvent(updatedEvent);
    await loadEvents();
  };

  const handleDeleteSkier = async (skierId: string) => {
    if (!selectedEvent) return;
    const updatedEvent = {
      ...selectedEvent,
      skiers: selectedEvent.skiers.filter(s => s.id !== skierId)
    };
    await saveEvent(updatedEvent);
    await loadEvents();
    if (activeSkier?.id === skierId) {
      setActiveSkier(null);
    }
  };

  const handleImportSkiers = async (importedSkiers: Skier[]) => {
    if (!selectedEvent) return;
    const updatedEvent = {
      ...selectedEvent,
      skiers: [...selectedEvent.skiers, ...importedSkiers]
    };
    await saveEvent(updatedEvent);
    await loadEvents();
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    if (!selectedEvent) return;
    
    const dragIndexStr = e.dataTransfer.getData('text/plain');
    if (!dragIndexStr) return;
    
    const dragIndex = parseInt(dragIndexStr, 10);
    if (dragIndex === dropIndex) return;

    const newSkiers = [...selectedEvent.skiers];
    const [draggedSkier] = newSkiers.splice(dragIndex, 1);
    newSkiers.splice(dropIndex, 0, draggedSkier);

    const updatedEvent = { ...selectedEvent, skiers: newSkiers };
    await saveEvent(updatedEvent);
    await loadEvents();
  };

  return (
    <div className="startlist">
      <div className="startlist__header">
        <select 
          className="startlist__select"
          value={selectedEventId || ''} 
          onChange={(e) => setSelectedEventId(e.target.value)}
        >
          <option value="" disabled>Select an event...</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
        <button className="btn btn--sm btn--primary" onClick={handleCreateEvent}>
          New Event
        </button>
      </div>

      {selectedEvent && (
        <div className="startlist__toolbar">
          <button className="btn btn--sm btn--ghost" onClick={handleAddSkier}>
            + Add Skier
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => setIsImportOpen(true)}>
            Import...
          </button>
        </div>
      )}

      <div className="startlist__list">
        {!selectedEvent && (
          <div className="startlist__empty">Please select or create an event.</div>
        )}
        
        {selectedEvent?.skiers.length === 0 && (
          <div className="startlist__empty">No skiers in this event.</div>
        )}

        {selectedEvent?.skiers.map((skier, index) => {
          const isActive = activeSkier?.id === skier.id;
          return (
            <div 
              key={skier.id}
              className={`startlist__item ${isActive ? 'startlist__item--active' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => setActiveSkier(skier)}
            >
              <div className="startlist__item-drag">⋮⋮</div>
              <div className="startlist__item-content">
                <div className="startlist__item-name">
                  {skier.bib && <span className="startlist__item-bib">{skier.bib}</span>}
                  {skier.name}
                </div>
                <div className="startlist__item-meta">
                  {[skier.club, skier.className].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button 
                className="startlist__item-delete"
                onClick={(e) => { e.stopPropagation(); handleDeleteSkier(skier.id); }}
                title="Delete skier"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <ImportDialog 
        isOpen={isImportOpen} 
        onClose={() => setIsImportOpen(false)} 
        onImport={handleImportSkiers} 
      />
    </div>
  );
}
