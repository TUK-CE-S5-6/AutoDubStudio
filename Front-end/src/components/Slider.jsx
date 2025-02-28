// SliderComponent.jsx
import React from 'react';

const SliderComponent = ({ value, onChange, min, max, step }) => {
  return (
    <div className="playback-bar">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
      />
      <span>{value.toFixed(1)} s</span>
    </div>
  );
};

export default SliderComponent;
