import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Palette, Eraser, Save, Trash2, Download, Home, Plus, Grid, Circle, Square } from 'lucide-react';

// Utility functions for storage and geolocation
const storage = {
  getSketches: () => {
    try {
      const sketches = JSON.parse(localStorage.getItem('geosketches') || '[]');
      return sketches;
    } catch (error) {
      console.error('Error loading sketches:', error);
      return [];
    }
  },
  
  saveSketch: (sketch) => {
    try {
      const sketches = storage.getSketches();
      const newSketch = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...sketch
      };
      sketches.push(newSketch);
      localStorage.setItem('geosketches', JSON.stringify(sketches));
      return newSketch;
    } catch (error) {
      console.error('Error saving sketch:', error);
      return null;
    }
  },
  
  deleteSketch: (id) => {
    try {
      const sketches = storage.getSketches();
      const filtered = sketches.filter(s => s.id !== id);
      localStorage.setItem('geosketches', JSON.stringify(filtered));
      return true;
    } catch (error) {
      console.error('Error deleting sketch:', error);
      return false;
    }
  }
};

const geo = {
  getCurrentLocation: () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported by this browser'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          let errorMessage = 'Location access failed';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location access denied by user';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information unavailable';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out';
              break;
            default:
              errorMessage = 'Unknown location error';
              break;
          }
          reject(new Error(errorMessage));
        },
        {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 300000
        }
      );
    });
  }
};

// Canvas Drawing Component
const CanvasBoard = ({ onSave }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [tool, setTool] = useState('brush');
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('loading');
  const [locationError, setLocationError] = useState('');
  const [autoSaveTimer, setAutoSaveTimer] = useState(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [hasAutoSaved, setHasAutoSaved] = useState(false);
  const [pendingAutoSave, setPendingAutoSave] = useState(false);



  // Initialize canvas and get location
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // Set drawing properties
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Get current location
    geo.getCurrentLocation()
      .then(coords => {
        setLocation(coords);
        setLocationStatus('success');
        setLocationError('');
      })
      .catch(error => {
        console.error('Location error:', error);
        setLocationStatus('error');
        setLocationError(error.message);
      });
  }, []);

  // Auto-save functionality using Background Tasks API fallback
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    
    const timer = setTimeout(() => {
      if (Date.now() - lastActivity > 30000) {
        handleSave(true);
      }
    }, 30000);
    
    setAutoSaveTimer(timer);
  }, [lastActivity]);
  useEffect(() => {
  scheduleAutoSave();
}, [scheduleAutoSave, lastActivity]);


  useEffect(() => {
  geo.getCurrentLocation()
    .then(coords => {
      setLocation(coords);
      setLocationStatus('success');
      setLocationError('');

      if (pendingAutoSave && !hasAutoSaved) {
        handleSave(true);
        setPendingAutoSave(false);
      }
    })
    .catch(error => {
      console.error('Location error:', error);
      setLocationStatus('error');
      setLocationError(error.message);
    });
}, []);


  const retryLocation = () => {
    setLocationStatus('loading');
    setLocationError('');
    
    geo.getCurrentLocation()
      .then(coords => {
        setLocation(coords);
        setLocationStatus('success');
        setLocationError('');
      })
      .catch(error => {
        console.error('Location error:', error);
        setLocationStatus('error');
        setLocationError(error.message);
      });
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    setIsDrawing(true);
    setLastActivity(Date.now());
    setHasAutoSaved(false);
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    
    ctx.lineWidth = brushSize;
    
    if (tool === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    } else if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    }
    
    ctx.lineTo(x, y);
    ctx.stroke();
    
    setLastActivity(Date.now());
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setLastActivity(Date.now());
  };

  const handleSave = (isAutoSave = false) => {
  const canvas = canvasRef.current;
  const dataURL = canvas.toDataURL('image/png');

  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const isEmpty = imageData.data.every(pixel => pixel === 0);

  if (isEmpty && !isAutoSave) {
    alert('Please draw something before saving!');
    return;
  }

  // For auto-save, wait for location or retry later
  if (isEmpty) return;
  if (isAutoSave) {
    if (hasAutoSaved) return;
    if (locationStatus === 'loading') {
      setPendingAutoSave(true);
      return;
    }
  }

  const sketch = {
    imageData: dataURL,
    location: location, // will be null if failed
    isAutoSave
  };

  const savedSketch = storage.saveSketch(sketch);
  if (savedSketch && onSave) {
    onSave(savedSketch, isAutoSave);
  }

  if (isAutoSave) {
    setHasAutoSaved(true);
  }
};



  const downloadSketch = () => {
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `geosketch-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  };

  const colors = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500'];

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="p-4 border-b">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Create New Sketch</h2>
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center">
              <MapPin className="w-4 h-4 mr-1" />
              {locationStatus === 'loading' && 'Getting your location...'}
              {locationStatus === 'success' && location && 
                `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
              {locationStatus === 'error' && (
                <span className="text-red-600">
                  {locationError || 'Location unavailable'}
                </span>
              )}
            </div>
            {locationStatus === 'error' && (
              <button
                onClick={retryLocation}
                className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
              >
                Retry Location
              </button>
            )}
          </div>
        </div>

        {/* Location Help */}
        {locationStatus === 'error' && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-semibold text-yellow-800 mb-2">Location Access Issues?</h4>
            <div className="text-sm text-yellow-700 space-y-1">
              <p><strong>Common solutions:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>Click the location icon in your browser's address bar and allow location access</li>
                <li>Check if location services are enabled in your browser settings</li>
                <li>For Chrome: Settings → Privacy and security → Site Settings → Location</li>
                <li>Make sure you're using HTTPS (required for location API)</li>
                <li>Try refreshing the page after enabling location</li>
              </ul>
              <p className="mt-2 text-xs text-yellow-600">
                <strong>Note:</strong> You can still draw and save sketches without location data!
              </p>
            </div>
          </div>
        )}

        {/* Tools */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex flex-wrap items-center gap-4">
            {/* Tool Selection */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTool('brush')}
                className={`p-2 rounded ${tool === 'brush' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              >
                <Palette className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool('eraser')}
                className={`p-2 rounded ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              >
                <Eraser className="w-4 h-4" />
              </button>
            </div>

            {/* Color Picker */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Color:</span>
              <div className="flex gap-1">
                {colors.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded border-2 ${color === c ? 'border-gray-800' : 'border-gray-300'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded border"
              />
            </div>

            {/* Brush Size */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Size:</span>
              <input
                type="range"
                min="1"
                max="50"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-gray-600">{brushSize}px</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={clearCanvas}
                className="flex items-center gap-1 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
              <button
                onClick={downloadSketch}
                className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={() => handleSave(false)}
                className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="p-4">
          <canvas
            ref={canvasRef}
            className="w-full h-96 border-2 border-gray-300 rounded cursor-crosshair touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
      </div>
    </div>
  );
};

// Sketch Card Component
const SketchCard = ({ sketch, onDelete }) => {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatLocation = (location) => {
    if (!location) return 'Location unavailable';
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  };

  const downloadSketch = () => {
    const link = document.createElement('a');
    link.download = `geosketch-${sketch.id}.png`;
    link.href = sketch.imageData;
    link.click();
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      <div className="aspect-square bg-gray-100">
        <img
          src={sketch.imageData}
          alt="Sketch"
          className="w-full h-full object-contain"
        />
      </div>
      <div className="p-4">
        <div className="flex items-center text-sm text-gray-600 mb-2">
          <MapPin className="w-4 h-4 mr-1" />
          {formatLocation(sketch.location)}
        </div>
        <div className="text-xs text-gray-500 mb-3">
          {formatDate(sketch.timestamp)}
          {sketch.isAutoSave && <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded">Auto-saved</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadSketch}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            onClick={() => onDelete(sketch.id)}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// Main App Component
const GeoSketch = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [sketches, setSketches] = useState([]);
  const [notification, setNotification] = useState('');

  // Load sketches on mount
  useEffect(() => {
    setSketches(storage.getSketches());
  }, []);

  const handleSketchSave = (sketch, isAutoSave) => {
    setSketches(prev => [...prev, sketch]);
    
    if (isAutoSave) {
      setNotification('Sketch auto-saved!');
    } else {
      setNotification('Sketch saved successfully!');
    }
    
    setTimeout(() => setNotification(''), 3000);
  };

  const handleDeleteSketch = (id) => {
    if (window.confirm('Are you sure you want to delete this sketch?')) {
      if (storage.deleteSketch(id)) {
        setSketches(prev => prev.filter(s => s.id !== id));
        setNotification('Sketch deleted successfully!');
        setTimeout(() => setNotification(''), 3000);
      }
    }
  };

  const renderHome = () => (
    <div className="max-w-4xl mx-auto p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">GeoSketch</h1>
        <p className="text-lg text-gray-600">Draw your thoughts, share your location</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
          <div className="text-center">
            <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Create New Sketch</h3>
            <p className="text-gray-600 mb-4">Start drawing and automatically save it with your current location</p>
            <button
              onClick={() => setCurrentPage('create')}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition-colors"
            >
              Start Drawing
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
          <div className="text-center">
            <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Grid className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">View My Sketches</h3>
            <p className="text-gray-600 mb-4">Browse your saved sketches and their locations</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-2xl font-bold text-gray-800">{sketches.length}</span>
              <span className="text-gray-600">sketches saved</span>
            </div>
            <button
              onClick={() => setCurrentPage('gallery')}
              className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 transition-colors"
            >
              View Gallery
            </button>
          </div>
        </div>
      </div>

      {/* Recent Sketches Preview */}
      {sketches.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Recent Sketches</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sketches.slice(-4).map((sketch) => (
              <div key={sketch.id} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={sketch.imageData}
                  alt="Recent sketch"
                  className="w-full h-full object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderGallery = () => (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">My Sketches ({sketches.length})</h2>
        <button
          onClick={() => setCurrentPage('create')}
          className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          <Plus className="w-4 h-4" />
          New Sketch
        </button>
      </div>

      {sketches.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Grid className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No sketches yet</h3>
          <p className="text-gray-500 mb-4">Create your first sketch to get started!</p>
          <button
            onClick={() => setCurrentPage('create')}
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
          >
            Create First Sketch
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sketches.map((sketch) => (
            <SketchCard
              key={sketch.id}
              sketch={sketch}
              onDelete={handleDeleteSketch}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentPage('home')}
              className="flex items-center gap-2 text-xl font-bold text-gray-800"
            >
              <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center">
                <Palette className="w-4 h-4" />
              </div>
              GeoSketch
            </button>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentPage('home')}
                className={`flex items-center gap-2 px-3 py-1 rounded ${
                  currentPage === 'home' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Home className="w-4 h-4" />
                Home
              </button>
              <button
                onClick={() => setCurrentPage('create')}
                className={`flex items-center gap-2 px-3 py-1 rounded ${
                  currentPage === 'create' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Plus className="w-4 h-4" />
                Create
              </button>
              <button
                onClick={() => setCurrentPage('gallery')}
                className={`flex items-center gap-2 px-3 py-1 rounded ${
                  currentPage === 'gallery' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Grid className="w-4 h-4" />
                Gallery
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Notification */}
      {notification && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
          {notification}
        </div>
      )}

      {/* Main Content */}
      <main className="py-6">
        {currentPage === 'home' && renderHome()}
        {currentPage === 'create' && <CanvasBoard onSave={handleSketchSave} />}
        {currentPage === 'gallery' && renderGallery()}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-gray-600">
          <p>GeoSketch - Draw your thoughts, share your location</p>
          <p className="text-sm mt-2">Built with React, Canvas API, Geolocation API, and Background Tasks</p>
        </div>
      </footer>
    </div>
  );
};

export default GeoSketch;