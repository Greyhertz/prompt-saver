import React, { useEffect, useState } from 'react';

const SaveStatus = ({ status }: { status: 'saving' | 'saved' | 'idle' }) => {
  return (
    <div style={{
      position: 'absolute',
      right: '10px',
      top: '10px',
      fontSize: '12px',
      color: status === 'saved' ? 'green' : 'gray',
      pointerEvents: 'none'
    }}>
      {status === 'saved' ? '✓ Saved' : status === 'saving' ? 'Saving...' : ''}
    </div>
  );
};

export default SaveStatus