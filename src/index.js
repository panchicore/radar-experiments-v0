// Inicializar mapa en Barranquilla with modified zoom behavior
const map = L.map('map', {
  scrollWheelZoom: 'center', // Keep the center fixed during mousewheel zoom
  doubleClickZoom: 'center', // Keep the center fixed during double-click zoom
  touchZoom: 'center', // Keep the center fixed during touch zoom
  zoomDelta: 1,
  zoomSnap: 0.5
}).setView([10.99654, -74.81899], 14);

// Añadir capa base de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Variables globales
let centerMarker = null;
let radarLayer = null;
let sectorLayers = [];
let pointsOfInterest = [];
let geojsonLayer = null;
let poisVisible = true; // Estado de visibilidad de los POIs
let distanceLabels = []; // Para almacenar referencias a las etiquetas de distancia
let followingMapCenter = true; // Nueva variable para controlar si el radar sigue el centro del mapa
let centerCircleMarker = null; // New variable for circle marker
let radarVisible = true; // Nueva variable para controlar la visibilidad del radar

// Configuración inicial
const config = {
  centerCoords: [10.99654, -74.81899], // [lat, lng] para Leaflet
  centerCoordsGeoJSON: [-74.81899, 10.99654], // [lng, lat] para GeoJSON
  radiusMeters: 20000,
  numSectors: 36
};

// Datos de muestra para POIs - Simplificado para pruebas iniciales
const samplePOIs = [
  {
    coords: [11.00654, -74.80899],
    level: 10,
    description: "Zona segura - Norte (45°)"
  },
  {
    coords: [10.98654, -74.82899],
    level: 1,
    description: "Zona peligrosa - Sur (225°)"
  },
  {
    coords: [11.00154, -74.82899],
    level: 5,
    description: "Zona neutra - Noroeste (153.4°)"
  },
  {
    coords: [10.98223, -74.83372],
    level: 10,
    description: "Zona segura cerca de zona peligrosa"
  },
  {
    coords: [11.01972, -74.86814],
    level: 1,
    description: "Zona peligrosa"
  },
];

// Función para calcular el ángulo en grados
function calculateAngle(centerLatLng, targetLatLng) {
  // Calcular el vector desde el centro al punto objetivo
  const dx = targetLatLng.lng - centerLatLng.lng;
  const dy = targetLatLng.lat - centerLatLng.lat;

  // Usando atan2 para obtener el ángulo
  // atan2 devuelve ángulo en radianes: Este = 0, Norte = π/2, Oeste = π, Sur = -π/2
  let angleRad = Math.atan2(dy, dx);

  // Convertir de radianes a grados (0-360)
  let angleDeg = angleRad * (180 / Math.PI);

  // Asegurar que el ángulo esté en el rango 0-360
  if (angleDeg < 0) {
    angleDeg += 360;
  }

  return angleDeg;
}

// Función para calcular la distancia en metros entre dos puntos
function calculateDistance(latlng1, latlng2) {
  return map.distance(latlng1, latlng2);
}

// Función para calcular un punto destino dado un punto inicial, distancia y ángulo
function destinationPoint(startLatLng, distance, angle) {
  // Convertir ángulo a radianes (0° = este, 90° = norte)
  const angleRad = angle * Math.PI / 180;

  // Constantes para conversión aproximada (suficiente para visualización)
  const latPerMeter = 1 / 111111; // aprox. 1 metro en grados de latitud
  const lngPerMeter = 1 / (111111 * Math.cos(startLatLng.lat * Math.PI / 180)); // ajuste por latitud

  // Calcular desplazamiento
  const latOffset = distance * latPerMeter * Math.sin(angleRad);
  const lngOffset = distance * lngPerMeter * Math.cos(angleRad);

  // Retornar nueva posición
  return L.latLng(
    startLatLng.lat + latOffset,
    startLatLng.lng + lngOffset
  );
}

// Agregar función para actualizar posición del radar cuando el mapa se mueve
function updateRadarPosition() {
  // Get current map center
  const mapCenter = map.getCenter();
  
  // Update configuration coordinates
  config.centerCoords = [mapCenter.lat, mapCenter.lng];
  config.centerCoordsGeoJSON = [mapCenter.lng, mapCenter.lat];
  
  // Remove any existing markers
  if (centerMarker) {
    if (centerMarker.getTooltip()) {
      centerMarker.closeTooltip();
    }
    map.removeLayer(centerMarker);
    centerMarker = null;
  }
  
  // Remove any existing circle marker and its plus symbol
  if (centerCircleMarker) {
    if (centerCircleMarker.getTooltip()) {
      centerCircleMarker.closeTooltip();
    }
    
    // Remove the plus symbol if it exists
    if (centerCircleMarker._plusSymbol && centerCircleMarker._plusSymbol.parentNode) {
      centerCircleMarker._plusSymbol.parentNode.removeChild(centerCircleMarker._plusSymbol);
    }
    
    map.removeLayer(centerCircleMarker);
    centerCircleMarker = null;
  }
  
  // Clean up any ghost elements
  document.querySelectorAll('.center-radar-marker, .clean-center-marker, .center-plus-symbol').forEach(el => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // Create a simpler circle marker without the plus symbol since we have the fixed crosshair
  centerCircleMarker = L.circleMarker(mapCenter, {
    radius: 4,
    color: 'white',
    weight: 2,
    fillColor: 'black',
    fillOpacity: 0.8,
    pane: 'markerPane'
  }).addTo(map);
  
  // Add tooltip
  centerCircleMarker.bindTooltip("El radar se mueve con el mapa", {
    permanent: false,
    direction: "top",
    offset: [0, -5]
  });
  
  // Update coordinates display
  document.getElementById('coordinates-display').innerHTML =
    `Posición: ${mapCenter.lat.toFixed(5)}, ${mapCenter.lng.toFixed(5)}`;
  
  // Update distance labels and radar
  updateDistanceLabels();
  updateRadar();
}

// Función debounce para eventos de mapa
function debounceMapEvent(func, wait) {
  let timeout;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      func.apply(context, args);
    }, wait);
  };
}

// Función para mostrar notificación temporal
function showNotification(message) {
  // Verificar si ya existe un div de notificación y eliminarlo
  const existingNotification = document.getElementById('map-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Crear elemento de notificación
  const notification = document.createElement('div');
  notification.id = 'map-notification';
  notification.style.cssText = 'position:absolute;top:20px;left:50%;transform:translateX(-50%);background-color:rgba(0,0,0,0.7);color:white;padding:10px 20px;border-radius:20px;z-index:1000;font-size:14px;font-weight:bold;';
  notification.textContent = message;
  
  // Añadir al mapa
  document.querySelector('.leaflet-container').appendChild(notification);
  
  // Eliminar después de 3 segundos
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// Agregar POIs de muestra
function addSamplePOIs() {
  console.log("=== AGREGANDO PUNTOS DE INTERÉS ===");

  // Limpiar POIs existentes
  pointsOfInterest.forEach(poi => {
    if (poi.marker) {
      map.removeLayer(poi.marker);
    }
  });
  pointsOfInterest = [];

  // Añadir puntos de muestra
  samplePOIs.forEach((poi, index) => {
    addPOI(poi, index);
  });

  console.log(`Total de POIs: ${pointsOfInterest.length}`);
  console.log("=== FIN AGREGAR PUNTOS DE INTERÉS ===");
}

// Función para alternar la visibilidad de los POIs
function togglePOIsVisibility() {
  poisVisible = !poisVisible;
  
  // Actualizar todos los POIs visibles
  pointsOfInterest.forEach(poi => {
    if (!poi.invisible) { // Solo afectar a los POIs visibles (no los invisibles usados para cálculos)
      if (poisVisible) {
        if (poi.hiddenMarker) {
          // Restaurar marcador previamente oculto
          poi.marker = poi.hiddenMarker;
          poi.marker.addTo(map);
          poi.hiddenMarker = null;
        }
      } else {
        // Guardar referencia al marcador y quitarlo del mapa
        poi.hiddenMarker = poi.marker;
        map.removeLayer(poi.marker);
        
        // Mantener un objeto que simule el marcador para cálculos de radar
        poi.marker = {
          getLatLng: function() {
            return L.latLng(poi.coords[0], poi.coords[1]);
          }
        };
      }
    }
  });
  
  // Gestionar etiquetas de distancia
  if (poisVisible) {
    updateDistanceLabels(); // Recrear etiquetas
  } else {
    // Eliminar todas las etiquetas
    distanceLabels.forEach(label => {
      if (map.hasLayer(label)) {
        map.removeLayer(label);
      }
    });
    distanceLabels = [];
  }
  
  // Actualizar la visibilidad de los puntos en la capa GeoJSON
  if (geojsonLayer) {
    // Si hay un GeoJSON cargado, recrear la capa con los nuevos filtros de visibilidad
    if (map.hasLayer(geojsonLayer)) {
      map.removeLayer(geojsonLayer);
    }
    
    // Si hay datos GeoJSON almacenados, volver a aplicarlos con el nuevo estado de visibilidad
    if (window.lastLoadedGeoJSON) {
      processGeoJSON(window.lastLoadedGeoJSON);
    }
  }
  
  // Actualizar texto del botón
  const toggleButton = document.getElementById('toggle-pois-btn');
  if (toggleButton) {
    toggleButton.textContent = poisVisible ? 'Ocultar POIs' : 'Mostrar POIs';
    toggleButton.title = poisVisible ? 'Ocultar marcadores de puntos de interés' : 'Mostrar marcadores de puntos de interés';
  }
  
  // Mostrar notificación
  showNotification(poisVisible ? "POIs visibles" : "POIs ocultos (radar sigue funcionando)");
}

// Modificar la función addPOI para respetar el estado de visibilidad
function addPOI(poi, index) {
  // Si se especifica que es invisible, usar la función especializada
  if (poi.invisible) {
    return addInvisiblePOI(poi, index);
  }
  
  // Elegir color del icono según el nivel
  const iconUrl = poi.level <= 3 ? 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' :
    poi.level <= 7 ? 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png' :
      'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png';

  const icon = L.icon({
    iconUrl: iconUrl,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  // Calcular distancia desde el centro
  const centerLatLng = L.latLng(config.centerCoords[0], config.centerCoords[1]);
  const poiLatLng = L.latLng(poi.coords[0], poi.coords[1]);
  const distance = calculateDistance(centerLatLng, poiLatLng);
  const distanceText = formatDistance(distance);

  // Crear marcador (pero no añadirlo al mapa si los POIs están ocultos)
  const marker = L.marker(poi.coords, {
    title: `${poi.description} (${distanceText})`,
    icon: icon
  });

  marker.bindPopup(`<strong>${poi.description}</strong><br>Nivel: ${poi.level}<br>Distancia: ${distanceText}<br>Color: ${getLevelColor(poi.level)}`);
  
  // Agregar al mapa solo si los POIs son visibles
  if (poisVisible) {
    marker.addTo(map);
    
    // Crear etiqueta de distancia
    const distanceLabel = createDistanceLabel(poi.coords, distanceText);
    distanceLabels.push(distanceLabel);
  }

  const poiObject = {
    marker: poisVisible ? marker : {
      getLatLng: function() {
        return L.latLng(poi.coords[0], poi.coords[1]);
      }
    },
    level: poi.level,
    description: poi.description,
    coords: poi.coords,
    distance: distance
  };
  
  // Guardar referencia al marcador original si está oculto
  if (!poisVisible) {
    poiObject.hiddenMarker = marker;
  }
  
  pointsOfInterest.push(poiObject);

  console.log(`POI #${index !== undefined ? index : pointsOfInterest.length - 1} agregado: ${poi.description}, Nivel: ${poi.level}, Coords: ${poi.coords[0]}, ${poi.coords[1]}, Distancia: ${distanceText}`);
}

// Función para formatear distancia de manera legible
function formatDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)}m`;
  } else {
    return `${(distanceMeters / 1000).toFixed(1)}km`;
  }
}

// Función para crear etiqueta de distancia
function createDistanceLabel(coords, text) {
  const labelIcon = L.divIcon({
    className: 'distance-label',
    html: `<div class="distance-text">${text}</div>`,
    iconSize: [60, 20],
    iconAnchor: [30, 0]
  });
  
  return L.marker(coords, {
    icon: labelIcon,
    zIndexOffset: -1000 // Para que aparezca detrás del marcador
  }).addTo(map);
}

// Añadir estilos CSS dinámicos para las etiquetas
function addDistanceLabelStyles() {
  const style = document.createElement('style');
  style.innerHTML = `
    .distance-label {
      background-color: transparent;
      border: none;
      box-shadow: none;
    }
    .distance-text {
      color: #333;
      background-color: rgba(255, 255, 255, 0.7);
      border-radius: 10px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: bold;
      text-align: center;
      white-space: nowrap;
      border: 1px solid #666;
    }
  `;
  document.head.appendChild(style);
}

// Actualizar etiquetas de distancia cuando el centro cambia
function updateDistanceLabels() {
  // Limpiar etiquetas existentes
  distanceLabels.forEach(label => {
    if (map.hasLayer(label)) {
      map.removeLayer(label);
    }
  });
  distanceLabels = [];
  
  // No mostrar etiquetas si los POIs están ocultos
  if (!poisVisible) return;
  
  // Crear nuevas etiquetas con distancias actualizadas
  const centerLatLng = L.latLng(config.centerCoords[0], config.centerCoords[1]);
  
  pointsOfInterest.forEach(poi => {
    if (!poi.invisible) {
      const poiLatLng = L.latLng(poi.coords[0], poi.coords[1]);
      const distance = calculateDistance(centerLatLng, poiLatLng);
      const distanceText = formatDistance(distance);
      
      // Actualizar la distancia almacenada
      poi.distance = distance;
      
      // Actualizar título y popup con nueva distancia
      if (poi.marker && typeof poi.marker.setTitle === 'function') {
        poi.marker.setTitle(`${poi.description} (${distanceText})`);
        
        // Actualizar popup solo si existe
        if (poi.marker.getPopup) {
          poi.marker.getPopup().setContent(
            `<strong>${poi.description}</strong><br>Nivel: ${poi.level}<br>Distancia: ${distanceText}<br>Color: ${getLevelColor(poi.level)}`
          );
        }
      }
      
      // Crear nueva etiqueta
      const distanceLabel = createDistanceLabel(poi.coords, distanceText);
      distanceLabels.push(distanceLabel);
    }
  });
  
  // También actualizar etiquetas para puntos GeoJSON si están visibles
  if (window.lastLoadedGeoJSON && poisVisible) {
    updateGeoJSONDistanceLabels();
  }
  
  console.log(`Etiquetas de distancia actualizadas: ${distanceLabels.length} etiquetas creadas`);
}

// Nueva función para actualizar etiquetas de puntos GeoJSON
function updateGeoJSONDistanceLabels() {
  if (!window.lastLoadedGeoJSON || !window.lastLoadedGeoJSON.features) return;
  
  const centerLatLng = L.latLng(config.centerCoords[0], config.centerCoords[1]);
  
  window.lastLoadedGeoJSON.features.forEach((feature, index) => {
    if (feature.geometry && feature.geometry.type === "Point") {
      const coords = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
      const poiLatLng = L.latLng(coords[0], coords[1]);
      const distance = calculateDistance(centerLatLng, poiLatLng);
      const distanceText = formatDistance(distance);
      
      // Crear etiqueta de distancia
      const distanceLabel = createDistanceLabel(coords, distanceText);
      distanceLabels.push(distanceLabel);
    }
  });
}

// Generar color según nivel (1-10)
function getLevelColor(level) {
  if (level === null) return 'rgba(128, 128, 128, 1.0)'; // Sin datos - gris completamente opaco

  // Asegurarnos que el nivel esté en el rango correcto
  const safeLevel = Math.max(1, Math.min(10, Math.round(level)));

  // Colores predefinidos para cada nivel - esto garantiza consistencia
  const colorMap = {
    1: 'rgba(255, 0, 0, 0.6)',      // Rojo puro
    2: 'rgba(255, 51, 0, 0.6)',     // Rojo naranja
    3: 'rgba(255, 102, 0, 0.6)',    // Naranja rojizo
    4: 'rgba(255, 153, 0, 0.6)',    // Naranja
    5: 'rgba(255, 204, 0, 0.6)',    // Amarillo naranja
    6: 'rgba(255, 255, 0, 0.6)',    // Amarillo puro
    7: 'rgba(204, 255, 0, 0.6)',    // Verde amarillento
    8: 'rgba(153, 255, 0, 0.6)',    // Lima
    9: 'rgba(102, 255, 0, 0.6)',    // Verde lima
    10: 'rgba(0, 255, 0, 0.6)'      // Verde puro
  };

  return colorMap[safeLevel];
}

// Determinar sectores del radar
function determineRadarSectors() {
  console.log("=== INICIO CÁLCULO DE SECTORES ===");
  console.log(`Radio: ${config.radiusMeters}m, Sectores: ${config.numSectors}`);

  const centerLatLng = L.latLng(config.centerCoords[0], config.centerCoords[1]);
  const numSectors = config.numSectors;
  const radiusMeters = config.radiusMeters;
  const sectorAngle = 360 / numSectors;

  // Crear sectores vacíos
  const sectors = Array(numSectors).fill().map((_, idx) => ({
    index: idx,
    level: null,
    distance: Infinity,
    poi: null
  }));

  // Mapeo detallado de POIs para debugging
  console.log("=== PUNTOS DE INTERÉS ===");
  pointsOfInterest.forEach((poi, idx) => {
    const poiLatLng = poi.marker.getLatLng();
    const distance = calculateDistance(centerLatLng, poiLatLng);
    const angle = calculateAngle(centerLatLng, poiLatLng);
    console.log(`POI #${idx}: ${poi.description}, Nivel: ${poi.level}, Distancia: ${distance.toFixed(0)}m, Ángulo: ${angle.toFixed(2)}°`);
  });

  // Procesar cada punto de interés
  console.log("=== ASIGNACIÓN DE SECTORES ===");
  pointsOfInterest.forEach((poi, idx) => {
    const poiLatLng = poi.marker.getLatLng();
    const distance = calculateDistance(centerLatLng, poiLatLng);
    const angle = calculateAngle(centerLatLng, poiLatLng);

    // Solo considerar puntos dentro del radio máximo
    if (distance <= radiusMeters) {
      // Determinar a qué sector pertenece
      let sectorIndex = Math.floor(angle / sectorAngle);
      if (sectorIndex < 0) sectorIndex += numSectors;
      if (sectorIndex >= numSectors) sectorIndex = 0; // Corrección para el caso borde de 360°

      const sectorStartAngle = sectorIndex * sectorAngle;
      const sectorEndAngle = (sectorIndex + 1) * sectorAngle;

      console.log(`POI #${idx} (${poi.description}): Ángulo ${angle.toFixed(1)}° → Sector ${sectorIndex} (${sectorStartAngle.toFixed(1)}° - ${sectorEndAngle.toFixed(1)}°)`);
      console.log(`  Distancia: ${distance.toFixed(0)}m vs actual ${sectors[sectorIndex].distance === Infinity ? 'sin datos' : sectors[sectorIndex].distance.toFixed(0) + 'm'}`);

      // Aplicar regla "el más cercano gana"
      if (distance < sectors[sectorIndex].distance) {
        console.log(`  → ¡Actualizado! Sector ${sectorIndex} cambia a nivel ${poi.level} (era ${sectors[sectorIndex].level === null ? 'null' : sectors[sectorIndex].level})`);
        sectors[sectorIndex] = {
          index: sectorIndex,
          level: poi.level,
          distance: distance,
          poi: poi
        };
      } else {
        console.log(`  → No actualizado. Ya existe un POI más cercano (${sectors[sectorIndex].distance.toFixed(0)}m < ${distance.toFixed(0)}m)`);
      }
    } else {
      console.log(`POI #${idx} (${poi.description}): Fuera del radio (${distance.toFixed(0)}m > ${radiusMeters}m)`);
    }
  });

  // Resumen de sectores
  console.log("=== RESUMEN DE SECTORES ===");
  const sectorsSummary = sectors.map((s, i) => {
    const sectorStartAngle = i * sectorAngle;
    const sectorEndAngle = (i + 1) * sectorAngle;
    return `${i} (${sectorStartAngle.toFixed(1)}°-${sectorEndAngle.toFixed(1)}°): ${s.level === null ? 'null' : s.level}`;
  });
  console.log(`Niveles por sector: \n${sectorsSummary.join('\n')}`);
  console.log("=== FIN CÁLCULO DE SECTORES ===");

  return sectors;
}

// Crear los sectores visuales del radar
function createRadarVisualization() {
  console.log("=== CREANDO VISUALIZACIÓN DE RADAR ===");

  // Limpiar capas previas
  if (radarLayer) {
    map.removeLayer(radarLayer);
  }

  sectorLayers.forEach(layer => {
    if (layer) map.removeLayer(layer);
  });
  sectorLayers = [];

  // Obtener sectores calculados
  const sectors = determineRadarSectors();
  const centerLatLng = L.latLng(config.centerCoords[0], config.centerCoords[1]);
  const numSectors = config.numSectors;
  const radiusMeters = config.radiusMeters;
  const sectorAngle = 360 / numSectors;

  // Crear capa para el borde del radar
  radarLayer = L.circle(centerLatLng, {
    radius: radiusMeters,
    color: '#333',
    weight: 0,
    fill: false
  });
  
  // Solo añadir al mapa si el radar es visible
  if (radarVisible) {
    radarLayer.addTo(map);
  }

  // Debug información
  console.log("=== VERIFICACIÓN DE ÁNGULOS ===");
  for (let i = 0; i < numSectors; i++) {
    const startAngle = i * sectorAngle;
    const endAngle = (i + 1) * sectorAngle;
    console.log(`Sector ${i}: ${startAngle.toFixed(1)}° - ${endAngle.toFixed(1)}°`);
  }

  // Crear sectores visuales
  console.log("=== CREANDO SECTORES VISUALES ===");
  for (let i = 0; i < numSectors; i++) {
    // Calcular ángulos del sector
    const startAngle = i * sectorAngle;
    const endAngle = (i + 1) * sectorAngle;

    // Calcular puntos del sector
    const sectorPoints = [centerLatLng];

    // Punto inicial del arco
    const startLatLng = destinationPoint(centerLatLng, radiusMeters, startAngle);
    sectorPoints.push(startLatLng);

    // Puntos intermedios del arco (para suavizar)
    const steps = 5; // Más pasos para sectores más suaves
    for (let j = 1; j < steps; j++) {
      const angle = startAngle + (endAngle - startAngle) * (j / steps);
      sectorPoints.push(destinationPoint(centerLatLng, radiusMeters, angle));
    }

    // Punto final del arco
    const endLatLng = destinationPoint(centerLatLng, radiusMeters, endAngle);
    sectorPoints.push(endLatLng);

    // Cerrar el polígono
    sectorPoints.push(centerLatLng);

    // Obtener color basado en el nivel
    const sectorColor = getLevelColor(sectors[i].level);
    console.log(`Sector ${i} (${startAngle.toFixed(1)}° - ${endAngle.toFixed(1)}°): Nivel ${sectors[i].level === null ? 'null' : sectors[i].level}, Color: ${sectorColor}`);

    if (sectors[i].poi) {
      console.log(`  → Determinado por POI: ${sectors[i].poi.description}`);
    }

    // Crear polígono del sector
    const sectorLayer = L.polygon(sectorPoints, {
      color: '#696969',
      weight: 0.8,  // Slightly thicker lines for better visibility of dashes
      dashArray: '3,3',
      fillColor: sectorColor,
      fillOpacity: sectors[i].level === null ? 0.0 : 0.5
    });
    
    // Solo añadir al mapa si el radar es visible
    if (radarVisible) {
      sectorLayer.addTo(map);
    }

    // Agregar popup con información
    let popupContent = `<strong>Sector ${i} (${startAngle.toFixed(1)}° - ${endAngle.toFixed(1)}°)</strong><br>`;
    if (sectors[i].level !== null) {
      popupContent += `Nivel: ${sectors[i].level}<br>`;
      popupContent += `Distancia: ${Math.round(sectors[i].distance)}m`;
      if (sectors[i].poi && sectors[i].poi.description) {
        popupContent += `<br>POI: ${sectors[i].poi.description}`;
      }
    } else {
      popupContent += 'Sin datos';
    }
    sectorLayer.bindPopup(popupContent);

    // Guardar referencia a la capa
    sectorLayers.push(sectorLayer);
  }

  // Agregar líneas radiales para mejor visualización
  for (let i = 0; i < numSectors; i++) {
    const angle = i * sectorAngle;
    const endPoint = destinationPoint(centerLatLng, radiusMeters, angle);

    // Crear línea desde el centro hasta el borde
    const radialLine = L.polyline([centerLatLng, endPoint], {
      color: '#888',
      weight: 0.5,
      opacity: 0.5,
      dashArray: '3,5'
    });
    
    // Solo añadir al mapa si el radar es visible
    if (radarVisible) {
      radialLine.addTo(map);
      sectorLayers.push(radialLine); // Guardar también las líneas radiales para poder ocultarlas
    }
  }

  // Agregar marcador central de referencia
  const centerReferenceMarker = L.marker(centerLatLng, {
    icon: L.divIcon({
      className: 'center-marker',
      html: '<div style="width:8px;height:8px;border-radius:4px;background-color:#fff;border:2px solid #333;"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    })
  });
  
  // Solo añadir al mapa si el radar es visible
  if (radarVisible) {
    centerReferenceMarker.addTo(map);
    sectorLayers.push(centerReferenceMarker); // Guardar también el marcador central
  }

  // Asegurar orden correcto de capas
  if (geojsonLayer) {
    geojsonLayer.bringToFront();
  }

  console.log("=== VISUALIZACIÓN DE RADAR COMPLETADA ===");
}

// Función para actualizar el radar completo
function updateRadar() {
  // Actualizar configuración desde inputs
  const radiusInput = document.getElementById('radius-input');
  const sectorsInput = document.getElementById('sectors-input');
  
  const newRadius = parseInt(radiusInput.value);
  const newSectors = parseInt(sectorsInput.value);
  
  if (newRadius !== config.radiusMeters || newSectors !== config.numSectors) {
    config.radiusMeters = newRadius;
    config.numSectors = newSectors;
    console.log(`Radar actualizado: Radio = ${config.radiusMeters}m, Sectores = ${config.numSectors}`);
  }
  
 // Actualizar visualización
 createRadarVisualization();
  
  // Actualizar etiquetas de distancia cada vez que se actualiza el radar
  updateDistanceLabels();
  
  // Asegurar que GeoJSON esté por encima
  if (geojsonLayer) {
    geojsonLayer.bringToFront();
  }
}

// Función para alternar la visibilidad del radar
function toggleRadarVisibility() {
  radarVisible = !radarVisible;
  
  // Alternar visibilidad de la capa principal del radar
  if (radarLayer) {
    if (radarVisible) {
      radarLayer.addTo(map);
    } else {
      map.removeLayer(radarLayer);
    }
  }
  
  // Alternar visibilidad de los sectores
  sectorLayers.forEach(layer => {
    if (layer) {
      if (radarVisible) {
        layer.addTo(map);
      } else {
        map.removeLayer(layer);
      }
    }
  });
  
  // Actualizar texto del botón
  const toggleButton = document.getElementById('toggle-radar-btn');
  if (toggleButton) {
    toggleButton.textContent = radarVisible ? 'Ocultar Radar' : 'Mostrar Radar';
    toggleButton.title = radarVisible ? 'Ocultar capas del radar' : 'Mostrar capas del radar';
  }
  
  // Mostrar notificación
  showNotification(radarVisible ? "Radar visible" : "Radar oculto");
}

// Modificar la función para agregar un nuevo punto de interés para ocultar temporalmente el radar
function addNewPOI() {
  // Si el radar está visible, ocultarlo temporalmente para facilitar la selección
  const wasRadarVisible = radarVisible;
  if (radarVisible) {
    toggleRadarVisibility(); // Ocultar radar
    showNotification("Radar oculto temporalmente para permitir la selección del punto");
  }
  
  map.once('click', function(e) {
    // Mostrar formulario popup para nivel y descripción
    const level = prompt("Nivel de seguridad (1-10):", "5");
    if (level === null) {
      // Si el usuario cancela, restaurar el radar si estaba visible originalmente
      if (wasRadarVisible && !radarVisible) {
        toggleRadarVisibility();
      }
      return;
    }

    const levelNum = parseInt(level);
    if (isNaN(levelNum) || levelNum < 1 || levelNum > 10) {
      alert("Por favor, introduce un nivel válido entre 1 y 10.");
      // Si hay error, restaurar el radar si estaba visible originalmente
      if (wasRadarVisible && !radarVisible) {
        toggleRadarVisibility();
      }
      return;
    }

    const description = prompt("Descripción:", "Nuevo punto de interés");
    if (description === null) {
      // Si el usuario cancela, restaurar el radar si estaba visible originalmente
      if (wasRadarVisible && !radarVisible) {
        toggleRadarVisibility();
      }
      return;
    }

    // Crear objeto POI
    const newPoi = {
      coords: [e.latlng.lat, e.latlng.lng],
      level: levelNum,
      description: description
    };

    // Agregar POI al mapa
    addPOI(newPoi);

    // Restaurar el radar si estaba visible originalmente
    if (wasRadarVisible && !radarVisible) {
      toggleRadarVisibility();
    }

    // Actualizar radar
    updateRadar();
  });

  alert("Haz clic en el mapa para agregar un punto de interés.");
}

// Función para cargar un archivo GeoJSON
function loadGeoJSON() {
  const fileInput = document.getElementById('geojson-file-input');

  fileInput.onchange = function(e) {
    const file = e.target.files[0];

    if (file) {
      const reader = new FileReader();

      reader.onload = function(e) {
        try {
          const geojsonData = JSON.parse(e.target.result);
          
          // Almacenar datos para permitir recargar al cambiar la visibilidad
          window.lastLoadedGeoJSON = geojsonData;
          
          processGeoJSON(geojsonData);
        } catch (error) {
          console.error("Error al parsear el archivo GeoJSON:", error);
          alert("Error al leer el archivo GeoJSON. Verifica que sea un JSON válido.");
        }
      };

      reader.readAsText(file);
    }
  };

  fileInput.click();
}

// Procesar datos GeoJSON
function processGeoJSON(geojsonData) {
  // Limpiar capa GeoJSON existente si la hay
  if (geojsonLayer) {
    map.removeLayer(geojsonLayer);
  }

  // Limpiar POIs existentes para usar solo los del GeoJSON
  pointsOfInterest.forEach(poi => {
    if (poi.marker) {
      map.removeLayer(poi.marker);
    }
  });
  pointsOfInterest = [];

  console.log("=== PROCESANDO GEOJSON ===");
  console.log("Tipo:", geojsonData.type);
  console.log("Características:", geojsonData.features ? geojsonData.features.length : 0);

  // Procesar características GeoJSON
  if (geojsonData.features && geojsonData.features.length > 0) {
    geojsonData.features.forEach((feature, index) => {
      // Extraer información de propiedades común para todos los tipos
      const level = feature.properties.level || feature.properties.security_level || 5;
      const description = feature.properties.description || feature.properties.name || `Característica ${index + 1}`;
      
      // Procesar según el tipo de geometría
      if (feature.geometry) {
        switch (feature.geometry.type) {
          case "Point":
            // Convertir de [lng, lat] a [lat, lng] para Leaflet
            const coords = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
            
            // Crear POI para el punto
            const poi = {
              coords: coords,
              level: parseInt(level),
              description: description
            };
            
            // Agregar al mapa
            addPOI(poi, index);
            break;
            
          case "LineString":
            // Extraer puntos significativos de la línea
            extractPointsFromLineString(feature, level, description, index);
            break;
            
          case "Polygon":
            // Extraer puntos significativos del polígono
            extractPointsFromPolygon(feature, level, description, index);
            break;
            
          case "MultiPoint":
            // Procesar cada punto en el MultiPoint
            feature.geometry.coordinates.forEach((pointCoord, pointIndex) => {
              const pointPoi = {
                coords: [pointCoord[1], pointCoord[0]],
                level: parseInt(level),
                description: `${description} - Punto ${pointIndex + 1}`
              };
              addPOI(pointPoi, `${index}-${pointIndex}`);
            });
            break;
            
          case "MultiLineString":
            // Procesar cada línea en el MultiLineString
            feature.geometry.coordinates.forEach((lineCoords, lineIndex) => {
              const lineFeature = {
                type: "Feature",
                properties: feature.properties,
                geometry: {
                  type: "LineString",
                  coordinates: lineCoords
                }
              };
              extractPointsFromLineString(lineFeature, level, `${description} - Línea ${lineIndex + 1}`, `${index}-${lineIndex}`);
            });
            break;
            
          case "MultiPolygon":
            // Procesar cada polígono en el MultiPolygon
            feature.geometry.coordinates.forEach((polyCoords, polyIndex) => {
              const polyFeature = {
                type: "Feature",
                properties: feature.properties,
                geometry: {
                  type: "Polygon",
                  coordinates: polyCoords
                }
              };
              extractPointsFromPolygon(polyFeature, level, `${description} - Polígono ${polyIndex + 1}`, `${index}-${polyIndex}`);
            });
            break;
        }
      }
    });

    // Crear capa GeoJSON para mostrar todas las geometrías
    geojsonLayer = L.geoJSON(geojsonData, {
      style: function(feature) {
        // Estilo para polígonos y líneas
        const level = feature.properties.level || feature.properties.security_level || 5;
        return {
          fillColor: getLevelColor(parseInt(level)),
          weight: 2,
          opacity: 0.5,         // Reducir la opacidad del borde
          color: getStrokeColor(parseInt(level)),
          dashArray: '3',
          fillOpacity: 0.15     // Reducir la opacidad del relleno
        };
      },
      // Personalizar la apariencia de los puntos
      pointToLayer: function(feature, latlng) {
        // Si los POIs están ocultos, no crear marcadores visibles para los puntos del GeoJSON
        if (!poisVisible) {
          return null; // No crear marcador visible
        }
        
        const level = feature.properties.level || feature.properties.security_level || 5;
        const levelNum = parseInt(level);
        
        // Elegir color del icono según el nivel
        const iconUrl = levelNum <= 3 ? 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' :
          levelNum <= 7 ? 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png' :
            'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png';

        const icon = L.icon({
          iconUrl: iconUrl,
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41]
        });
        
        return L.marker(latlng, {icon: icon});
      },
      filter: function(feature) {
        // Si los POIs están ocultos, filtrar los puntos (pero procesar otros tipos de geometría)
        if (!poisVisible && feature.geometry.type === "Point") {
          return false;
        }
        return true;
      },
      onEachFeature: function(feature, layer) {
        if (feature.properties) {
          let popupContent = "";

          if (feature.properties.description || feature.properties.name) {
            popupContent += `<strong>${feature.properties.description || feature.properties.name}</strong><br>`;
          }

          if (feature.properties.level || feature.properties.security_level) {
            popupContent += `Nivel: ${feature.properties.level || feature.properties.security_level}<br>`;
          }

          // Agregar todas las propiedades adicionales
          for (const prop in feature.properties) {
            if (prop !== 'description' && prop !== 'name' && prop !== 'level' && prop !== 'security_level') {
              popupContent += `${prop}: ${feature.properties[prop]}<br>`;
            }
          }

          if (popupContent !== "") {
            layer.bindPopup(popupContent);
          }
        }
      }
    });
    
    // Añadir la capa GeoJSON al mapa, asegurando que esté por encima de las otras capas
    geojsonLayer.addTo(map);
    
    // Forzar que se muestre por encima moviendo al frente
    if (geojsonLayer) {
      geojsonLayer.bringToFront();
    }

    // Si hay elementos en el GeoJSON, ajustar la vista del mapa
    map.fitBounds(geojsonLayer.getBounds(), { padding: [50, 50] });

    // Actualizar etiquetas de distancia para los puntos GeoJSON
    if (poisVisible) {
      updateGeoJSONDistanceLabels();
    }

    // Actualizar radar después de cargar GeoJSON
    updateRadar();
  } else {
    console.log("No se encontraron características en el GeoJSON");
    alert("El archivo GeoJSON no contiene características para mostrar en el radar.");
  }

  console.log("=== FIN PROCESAMIENTO GEOJSON ===");
}

// Función para extraer puntos representativos de un polígono
function extractPointsFromPolygon(feature, level, description, index) {
  const coordinates = feature.geometry.coordinates[0]; // Anillo exterior del polígono
  const levelInt = parseInt(level);
  
  // Calcular el centroide del polígono
  const centroid = calculatePolygonCentroid(coordinates);
  
  // Añadir el centroide como un punto de interés
  const centroidPoi = {
    coords: [centroid[1], centroid[0]],
    level: levelInt,
    description: `${description} - Centroide`
  };
  addInvisiblePOI(centroidPoi, `${index}-centroid`);
  
  // Mejorar la densidad de muestreo para capturar mejor el polígono
  // Muestrear puntos a lo largo de cada segmento del polígono
  for (let i = 0; i < coordinates.length - 1; i++) {
    const startCoord = coordinates[i];
    const endCoord = coordinates[i + 1];
    
    // Calcular la longitud del segmento (aproximada)
    const segmentLength = Math.sqrt(
      Math.pow(endCoord[0] - startCoord[0], 2) + 
      Math.pow(endCoord[1] - startCoord[1], 2)
    );
    
    // Determinar cuántos puntos interpolar
    // Usar más puntos para segmentos más largos
    const pointsToInterpolate = Math.max(
      3, 
      Math.ceil(segmentLength * 10000) // Factor de escala para coordenadas geográficas
    );
    
    // Generar puntos a lo largo del segmento
    for (let j = 0; j <= pointsToInterpolate; j++) {
      const fraction = j / pointsToInterpolate;
      const interpolatedLng = startCoord[0] + (endCoord[0] - startCoord[0]) * fraction;
      const interpolatedLat = startCoord[1] + (endCoord[1] - startCoord[1]) * fraction;
      
      const pointDesc = `${description} - Segmento ${i} (${Math.round(fraction * 100)}%)`;
      
      // Crear POI para el punto interpolado (convertir de [lng, lat] a [lat, lng])
      const pointPoi = {
        coords: [interpolatedLat, interpolatedLng],
        level: levelInt,
        description: pointDesc
      };
      
      // Añadir punto de interés con marcador invisible (solo para radar)
      addInvisiblePOI(pointPoi, `${index}-s${i}-p${j}`);
    }
  }
  
  console.log(`Extrayendo puntos mejorados para Polygon con ${coordinates.length} vértices`);
}

// Función para extraer puntos representativos de una línea
function extractPointsFromLineString(feature, level, description, index) {
  const coordinates = feature.geometry.coordinates;
  const levelInt = parseInt(level);
  
  // Mejorar la densidad de muestreo para capturar mejor la línea
  // Similar al enfoque para polígonos, muestrear puntos a lo largo de cada segmento
  for (let i = 0; i < coordinates.length - 1; i++) {
    const startCoord = coordinates[i];
    const endCoord = coordinates[i + 1];
    
    // Calcular la longitud del segmento (aproximada)
    const segmentLength = Math.sqrt(
      Math.pow(endCoord[0] - startCoord[0], 2) + 
      Math.pow(endCoord[1] - startCoord[1], 2)
    );
    
    // Determinar cuántos puntos interpolar
    const pointsToInterpolate = Math.max(
      3, 
      Math.ceil(segmentLength * 10000) // Factor de escala para coordenadas geográficas
    );
    
    // Generar puntos a lo largo del segmento
    for (let j = 0; j <= pointsToInterpolate; j++) {
      const fraction = j / pointsToInterpolate;
      const interpolatedLng = startCoord[0] + (endCoord[0] - startCoord[0]) * fraction;
      const interpolatedLat = startCoord[1] + (endCoord[1] - startCoord[1]) * fraction;
      
      const pointDesc = `${description} - Segmento ${i} (${Math.round(fraction * 100)}%)`;
      
      // Crear POI para el punto interpolado (convertir de [lng, lat] a [lat, lng])
      const pointPoi = {
        coords: [interpolatedLat, interpolatedLng],
        level: levelInt,
        description: pointDesc
      };
      
      // Añadir punto de interés con marcador invisible (solo para radar)
      addInvisiblePOI(pointPoi, `${index}-s${i}-p${j}`);
    }
  }
  
  console.log(`Extrayendo puntos mejorados para LineString con ${coordinates.length} vértices`);
}

// Calcular el centroide de un polígono
function calculatePolygonCentroid(coordinates) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[i + 1];
    
    const f = p1[0] * p2[1] - p2[0] * p1[1];
    area += f;
    cx += (p1[0] + p2[0]) * f;
    cy += (p1[1] + p2[1]) * f;
  }
  
  area /= 2;
  area = Math.abs(area);
  
  if (area === 0) {
    // Polígono degenerado, devolver el primer punto
    return coordinates[0];
  }
  
  cx = cx / (6 * area);
  cy = cy / (6 * area);
  
  return [cx, cy];
}

// Agregar POI invisible (solo para cálculos de radar, sin marcador visible)
function addInvisiblePOI(poi, index) {
  console.log(`POI invisible #${index} agregado: ${poi.description}, Nivel: ${poi.level}, Coords: ${poi.coords[0]}, ${poi.coords[1]}`);
  
  // Añadir a la lista de POIs pero sin marcador visible
  pointsOfInterest.push({
    marker: {
      getLatLng: function() {
        return L.latLng(poi.coords[0], poi.coords[1]);
      }
    },
    level: poi.level,
    description: poi.description,
    coords: poi.coords,
    invisible: true // Marcar como invisible para identificarlo
  });
}

// Función debounce para evitar actualizaciones excesivas
function debounce(func, wait) {
  let timeout;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      func.apply(context, args);
    }, wait);
  };
}

// Inicializar la aplicación
function initApp() {
  console.log("=== INICIALIZANDO APLICACIÓN ===");
  console.log(`Configuración inicial: Centro [${config.centerCoords}], Radio: ${config.radiusMeters}m, Sectores: ${config.numSectors}`);

  // Establecer valores iniciales en los inputs
  document.getElementById('radius-input').value = config.radiusMeters;
  document.getElementById('sectors-input').value = config.numSectors;

  // Agregar estilos para limpiar completamente marcadores
  addCleanMarkerStyles();
  
  // Add fixed center crosshair overlay
  addFixedCenterCrosshair();
  
  // Agregar elementos al mapa
  addCenterMarker();
  addSamplePOIs();
  createRadarVisualization();

  // Event listeners
  document.getElementById('update-btn').addEventListener('click', updateRadar);
  document.getElementById('add-poi-btn').addEventListener('click', addNewPOI);
  document.getElementById('load-geojson-btn').addEventListener('click', loadGeoJSON);
  
  // Añadir event listener para el toggle de POIs
  if (document.getElementById('toggle-pois-btn')) {
    document.getElementById('toggle-pois-btn').addEventListener('click', togglePOIsVisibility);
  } else {
    console.warn("No se encontró el botón toggle-pois-btn en el DOM");
  }
  
  // Añadir event listener para el toggle del radar
  if (document.getElementById('toggle-radar-btn')) {
    document.getElementById('toggle-radar-btn').addEventListener('click', toggleRadarVisibility);
  } else {
    console.warn("No se encontró el botón toggle-radar-btn en el DOM");
  }

  // Actualizaciones automáticas al cambiar inputs
  document.getElementById('radius-input').addEventListener('input', debounce(updateRadar, 300));
  document.getElementById('sectors-input').addEventListener('input', debounce(updateRadar, 300));
  
  // Event listener for map movement
  map.on('moveend', debounceMapEvent(updateRadarPosition, 200));

  // Add event listener for zoom events to ensure the radar stays centered
  map.on('zoomstart', function(e) {
    // Store current center before zoom
    map._lastCenter = map.getCenter();
  });

  map.on('zoomend', function(e) {
    // Check if center has changed during zoom
    const currentCenter = map.getCenter();
    const lastCenter = map._lastCenter;
    
    if (lastCenter && (currentCenter.lat !== lastCenter.lat || currentCenter.lng !== lastCenter.lng)) {
      // Reset to last center if it changed
      map.setView(lastCenter, map.getZoom(), {animate: false});
      
      // Update radar immediately after correcting the center
      updateRadarPosition();
    }
    
    // Reposition plus symbol after zoom
    if (centerCircleMarker && centerCircleMarker._plusSymbol) {
      const markerCenter = map.latLngToLayerPoint(centerCircleMarker.getLatLng());
      L.DomUtil.setPosition(centerCircleMarker._plusSymbol, markerCenter);
    }
  });

  // Add additional handler for box zoom
  map.on('boxzoomend', function(e) {
    // After box zoom, center the map on the radar center
    const mapCenter = map.getCenter();
    
    // Check if radar center matches map center
    if (config.centerCoords[0] !== mapCenter.lat || config.centerCoords[1] !== mapCenter.lng) {
      // Update radar position to match new center
      updateRadarPosition();
    }
  });

  // Añadir estilos CSS para etiquetas de distancia
  addDistanceLabelStyles();

  console.log("=== APLICACIÓN INICIALIZADA ===");
}

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initApp);

// Función para obtener color de borde según nivel (1-10)
function getStrokeColor(level) {
  if (level === null) return '#666'; // Sin datos - gris

  // Asegurarnos que el nivel esté en el rango correcto
  const safeLevel = Math.max(1, Math.min(10, Math.round(level)));

  // Colores predefinidos para cada nivel - más oscuros que los de relleno
  const colorMap = {
    1: '#cc0000',   // Rojo oscuro
    2: '#d13800',   // Rojo naranja oscuro
    3: '#d95e00',   // Naranja rojizo oscuro
    4: '#d77e00',   // Naranja oscuro
    5: '#d79c00',   // Amarillo naranja oscuro
    6: '#cccc00',   // Amarillo oscuro
    7: '#99cc00',   // Verde amarillento oscuro
    8: '#73cc00',   // Lima oscuro
    9: '#54cc00',   // Verde lima oscuro
    10: '#00cc00'   // Verde oscuro
  };

  return colorMap[safeLevel];
}

// Añadir estilos CSS para limpiar completamente cualquier rastro de marcadores
function addCleanMarkerStyles() {
  const style = document.createElement('style');
  style.innerHTML = `
    /* Remove all traces of old markers */
    .leaflet-marker-pane .center-radar-marker,
    .leaflet-marker-pane .clean-center-marker {
      display: none !important;
    }
    
    /* Make circle marker smooth */
    .leaflet-interactive {
      outline: none !important;
    }
    
    /* Center plus symbol */
    .center-plus-symbol {
      z-index: 1000;
      pointer-events: none;
    }
    
    /* Fixed center crosshair */
    #map-center-crosshair {
      /* Animation for better visibility during map operations */
      transition: opacity 0.2s ease-in-out;
    }
    
    /* Make crosshair more visible when the map is moving */
    .leaflet-container.leaflet-drag-target #map-center-crosshair,
    .leaflet-container.leaflet-zoom-anim #map-center-crosshair {
      opacity: 0.9;
    }
  `;
  document.head.appendChild(style);
}

// Agregar marcador central
function addCenterMarker() {
  // Remove any existing markers
  if (centerMarker) {
    if (centerMarker.getTooltip()) {
      centerMarker.closeTooltip();
    }
    map.removeLayer(centerMarker);
    centerMarker = null;
  }
  
  // Remove any existing circle marker and its plus symbol
  if (centerCircleMarker) {
    if (centerCircleMarker.getTooltip()) {
      centerCircleMarker.closeTooltip();
    }
    
    // Remove the plus symbol if it exists
    if (centerCircleMarker._plusSymbol && centerCircleMarker._plusSymbol.parentNode) {
      centerCircleMarker._plusSymbol.parentNode.removeChild(centerCircleMarker._plusSymbol);
    }
    
    map.removeLayer(centerCircleMarker);
    centerCircleMarker = null;
  }
  
  // Clean up any ghost elements
  document.querySelectorAll('.center-radar-marker, .clean-center-marker, .center-plus-symbol').forEach(el => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });

  // Get current map center
  const mapCenter = map.getCenter();
  config.centerCoords = [mapCenter.lat, mapCenter.lng];
  config.centerCoordsGeoJSON = [mapCenter.lng, mapCenter.lat];

  // Create a simpler circle marker without the plus symbol since we have the fixed crosshair
  centerCircleMarker = L.circleMarker(mapCenter, {
    radius: 4,
    color: 'white',
    weight: 2,
    fillColor: 'black',
    fillOpacity: 0.8,
    pane: 'markerPane'
  }).addTo(map);
  
  // Add tooltip
  centerCircleMarker.bindTooltip("El radar se mueve con el mapa", {
    permanent: false,
    direction: "top",
    offset: [0, -5]
  });
  
  // Update coordinates display
  document.getElementById('coordinates-display').innerHTML =
    `Posición: ${config.centerCoords[0].toFixed(5)}, ${config.centerCoords[1].toFixed(5)}`;
}

// Add a fixed crosshair to the center of the map container
function addFixedCenterCrosshair() {
  // Create the crosshair container
  const crosshair = document.createElement('div');
  crosshair.id = 'map-center-crosshair';
  crosshair.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    pointer-events: none;
    width: 20px;
    height: 20px;
  `;
  
  // Create the horizontal line
  const horizontalLine = document.createElement('div');
  horizontalLine.style.cssText = `
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    height: 2px;
    background-color: rgba(0,0,0,0.7);
    transform: translateY(-50%);
  `;
  
  // Create the vertical line
  const verticalLine = document.createElement('div');
  verticalLine.style.cssText = `
    position: absolute;
    top: 0;
    left: 50%;
    height: 100%;
    width: 2px;
    background-color: rgba(0,0,0,0.7);
    transform: translateX(-50%);
  `;
  
  // Create the center dot
  const centerDot = document.createElement('div');
  centerDot.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    width: 6px;
    height: 6px;
    background-color: white;
    border: 2px solid black;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  `;
  
  // Add the elements to the crosshair container
  crosshair.appendChild(horizontalLine);
  crosshair.appendChild(verticalLine);
  crosshair.appendChild(centerDot);
  
  // Add the crosshair to the map container
  document.querySelector('.leaflet-container').appendChild(crosshair);
  
  return crosshair;
}
