import React, { useState } from 'react';
import MapEditor from './components/MapEditor';
import StyleModal from './components/StyleModal';
import { RenderStyle } from './types';

const App: React.FC = () => {
  const [renderStyle, setRenderStyle] = useState<RenderStyle>({
    interiorColor: '#4A90E2',
    exteriorGrayscale: true,
    borderColor: '#000000',
    borderWidth: 2,
    strokeOpacity: 1,
    fillOpacity: 0.6,
  });

  const [pendingStyle, setPendingStyle] = useState<RenderStyle>(renderStyle);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<any>(null);

  const handleOpenStyleModal = () => {
    setPendingStyle(renderStyle);
    setIsStyleModalOpen(true);
  };

  const handleCancelStyle = () => {
    setPendingStyle(renderStyle);
    setIsStyleModalOpen(false);
  };

  const handleApplyStyle = () => {
    setRenderStyle(pendingStyle);
    setIsStyleModalOpen(false);
  };

  return (
    <div className="app">
      <div className="map-container">
        <button 
          className="style-button"
          onClick={handleOpenStyleModal}
          title="Personnaliser le style"
        >
          🎨 Personnaliser le style
        </button>
        
        <MapEditor 
          renderStyle={renderStyle}
          onZoneSelect={setSelectedZone}
          selectedZone={selectedZone}
        />
      </div>

      <StyleModal
        isOpen={isStyleModalOpen}
        style={pendingStyle}
        onStyleChange={setPendingStyle}
        onCancel={handleCancelStyle}
        onApply={handleApplyStyle}
      />
    </div>
  );
};

export default App;
