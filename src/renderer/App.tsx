import React, { useState } from 'react';
import MapEditor from './components/MapEditor';
import StylePanel from './components/StylePanel';
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

  const [selectedZone, setSelectedZone] = useState<any>(null);

  return (
    <div className="app">
      <div className="sidebar">
        <StylePanel 
          renderStyle={renderStyle} 
          onStyleChange={setRenderStyle}
        />
      </div>
      <div className="map-container">
        <MapEditor 
          renderStyle={renderStyle}
          onZoneSelect={setSelectedZone}
          selectedZone={selectedZone}
        />
      </div>
    </div>
  );
};

export default App;
