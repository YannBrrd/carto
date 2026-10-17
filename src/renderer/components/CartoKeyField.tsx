import React, { useState } from 'react';
import { CARTO_API_KEY_URL } from '../utils/basemap';

interface CartoKeyFieldProps {
  apiKey: string;           // The user's own key
  hasBuiltInKey?: boolean;  // The build provides a key, used when the user has none
  onSave: (apiKey: string) => void;  // An empty key removes it
}

// CARTO basemap API key: asked for while there is none at all, editable once saved
const CartoKeyField: React.FC<CartoKeyFieldProps> = ({ apiKey, hasBuiltInKey = false, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!apiKey && hasBuiltInKey && !isEditing) {
    return null;
  }

  if (apiKey && !isEditing) {
    return (
      <div className="carto-key-field saved">
        <span>Fond de carte CARTO : clé enregistrée</span>
        <button type="button" className="link-button" onClick={() => { setDraft(apiKey); setIsEditing(true); }}>
          Modifier
        </button>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(draft.trim());
    setIsEditing(false);
  };

  return (
    <form className={`carto-key-field ${apiKey ? '' : 'missing'}`} onSubmit={handleSubmit}>
      {!apiKey && <p>Le fond de carte CARTO demande une clé API gratuite.</p>}
      <label htmlFor="carto-api-key">Clé API CARTO</label>
      <input
        id="carto-api-key"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Collez votre clé"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="carto-key-actions">
        <button type="submit" disabled={!apiKey && !draft.trim()}>Enregistrer</button>
        {apiKey && (
          <button type="button" className="link-button" onClick={() => setIsEditing(false)}>Annuler</button>
        )}
        <a href={CARTO_API_KEY_URL} target="_blank" rel="noreferrer">Obtenir une clé gratuite</a>
      </div>
    </form>
  );
};

export default CartoKeyField;
