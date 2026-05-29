// Define strict geographical bounds for Karnataka/South India to prevent global map wrap
const southIndiaBounds = L.latLngBounds(
    L.latLng([11.0, 74.0]), // Southwest corner
    L.latLng([18.5, 78.5])  // Northeast corner
);

// Initialize the Map Engine Canvas focused on South India / Karnataka region
const map = L.map('map', {
    zoomControl: true,
    maxBounds: southIndiaBounds,     // Keeps user restricted to the operational region
    maxBoundsViscosity: 1.0,         // Rigid bounding wall response
    minZoom: 7                       // Prevents excessive zooming out
}).setView([12.7836, 77.6937], 14); // Centered default view around Suryanagara, Anekal

// 1. Basemap Layers Configurations
const openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri'
});

const baseLayers = {
    "OpenStreetMap": openStreetMap,
    "Satellite Imagery": satelliteMap
};
L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);
L.control.scale({ position: 'bottomleft' }).addTo(map);

// 2. Global Tracking State variables
let geojsonData = null;
let geojsonLayer = null;

// Dynamic Date and Time Engine Status Output
function updateDateTime() {
    const now = new Date();
    document.getElementById('dateTimeDisplay').innerText = now.toLocaleString();
}
setInterval(updateDateTime, 1000);
updateDateTime();

// Track mouse positioning capture updates
map.on('mousemove', function(e) {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);
    document.getElementById('mouseCoordinates').innerText = `Latitude: ${lat}, Longitude: ${lng}`;
});

// Helper utility to read feature properties dynamically ignoring uppercase/lowercase issues
function getPropValue(feature, targetKey) {
    if (!feature || !feature.properties) return null;
    const actualKey = Object.keys(feature.properties).find(k => k.toLowerCase() === targetKey.toLowerCase());
    return actualKey ? feature.properties[actualKey] : null;
}

// 3. Load & Process Your Shapefile-converted GeoJSON
fetch('data/layout.geojson')
    .then(response => response.json())
    .then(data => {
        geojsonData = data;
        initializeGisEngine(data);
        populateFilterDropdowns(data);
    })
    .catch(error => console.error('Error fetching layout GeoJSON data:', error));

function initializeGisEngine(data) {
    if (geojsonLayer) map.removeLayer(geojsonLayer);

    geojsonLayer = L.geoJSON(data, {
        style: function(feature) {
            return {
                color: "#134074",
                weight: 2,
                fillColor: "#8DA9C4",
                fillOpacity: 0.5
            };
        },
        onEachFeature: function(feature, layer) {
            // Interactive Event Hover Highlight Handlers
            layer.on({
                mouseover: function(e) {
                    const activeLayer = e.target;
                    activeLayer.setStyle({
                        weight: 4,
                        color: '#0B2545',
                        fillOpacity: 0.7
                    });
                },
                mouseout: function(e) {
                    const activePanel = document.getElementById('propertyInfoPanel');
                    const currentSelectedProp = activePanel ? activePanel.getAttribute('data-active-prop') : null;
                    const thisPropNo = getPropValue(e.target.feature, 'Property_N')?.toString();
                    
                    if (currentSelectedProp !== thisPropNo) {
                        geojsonLayer.resetStyle(e.target);
                    }
                },
                click: function(e) {
                    const props = e.target.feature.properties;
                    const center = e.target.getBounds().getCenter();
                    showPropertyDetails(props, center);
                    
                    geojsonLayer.resetStyle();
                    e.target.setStyle({ weight: 4, color: '#FFD700', fillOpacity: 0.6 });
                }
            });
        }
    }).addTo(map);

    if (geojsonLayer.getBounds().isValid()) {
        map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });
    }
}

// 4. Cascade Filtering Engine Elements Mapping
const districtSel = document.getElementById('districtFilter');
const talukSel = document.getElementById('talukFilter');
const layoutSel = document.getElementById('layoutFilter');
const propertyInput = document.getElementById('propertySearchInput');
const btnSearch = document.getElementById('btnSearch');

function populateFilterDropdowns(data) {
    // Collect unique Districts safely ignoring casing inconsistencies
    const districts = [...new Set(data.features.map(f => getPropValue(f, 'District')).filter(Boolean))];
    districts.forEach(d => {
        let opt = document.createElement('option');
        opt.value = d; opt.innerText = d;
        districtSel.appendChild(opt);
    });
}

// District Selection Change -> Populates Taluk Dropdown
districtSel.addEventListener('change', function() {
    talukSel.innerHTML = '<option value="">Select Taluk</option>';
    layoutSel.innerHTML = '<option value="">Select Layout</option>';
    talukSel.disabled = true; 
    layoutSel.disabled = true;
    propertyInput.disabled = true;
    btnSearch.disabled = true;
    propertyInput.value = "";
    clearInfoPanel();

    if (!this.value) return;

    // Filter features matching selected District context case-insensitively
    const filteredFeatures = geojsonData.features.filter(f => getPropValue(f, 'District') === this.value);
    const taluks = [...new Set(filteredFeatures.map(f => getPropValue(f, 'Taluk')).filter(Boolean))];

    taluks.forEach(t => {
        let opt = document.createElement('option');
        opt.value = t; opt.innerText = t;
        talukSel.appendChild(opt);
    });
    talukSel.disabled = false;
});

// Taluk Selection Change -> Populates Layout Dropdown
talukSel.addEventListener('change', function() {
    layoutSel.innerHTML = '<option value="">Select Layout</option>';
    layoutSel.disabled = true;
    propertyInput.disabled = true;
    btnSearch.disabled = true;
    propertyInput.value = "";
    clearInfoPanel();

    if (!this.value) return;

    // Filter Layouts matching chosen District and Taluk combination
    const filteredFeatures = geojsonData.features.filter(f => 
        getPropValue(f, 'District') === districtSel.value && getPropValue(f, 'Taluk') === this.value
    );
    const layouts = [...new Set(filteredFeatures.map(f => getPropValue(f, 'Layoutname')).filter(Boolean))];

    layouts.forEach(l => {
        let opt = document.createElement('option');
        opt.value = l; opt.innerText = l;
        layoutSel.appendChild(opt);
    });
    layoutSel.disabled = false;
});

// Layout Selection Change -> Zooms to Layout boundary per user request
layoutSel.addEventListener('change', function() {
    clearInfoPanel();
    propertyInput.value = "";

    if (!this.value) {
        propertyInput.disabled = true;
        btnSearch.disabled = true;
        return;
    }

    // Isolate features matching layout boundary context
    const selectedLayoutFeatures = geojsonData.features.filter(f => getPropValue(f, 'Layoutname') === this.value);
    
    if (selectedLayoutFeatures.length > 0) {
        const tempLayer = L.geoJSON({type: "FeatureCollection", features: selectedLayoutFeatures});
        const layoutBounds = tempLayer.getBounds();

        if (layoutBounds.isValid()) {
            // Zoom to layout boundary area frame
            map.fitBounds(layoutBounds, { padding: [50, 50], maxZoom: 17 });

            // Search setup is active but entirely optional for plot-level queries
            propertyInput.disabled = false;
            btnSearch.disabled = false;
        }
    }
});

// 5. Property ID Search Matcher (Scoped inside your active chosen layout filter)
btnSearch.addEventListener('click', executePropertySearch);
propertyInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') executePropertySearch();
});

function executePropertySearch() {
    const query = propertyInput.value.trim().toLowerCase();
    if (!query) {
        alert('Please enter a property number to locate.');
        return;
    }

    let matchLayer = null;

    // Search strictly inside the layout perimeter currently selected
    geojsonLayer.eachLayer(function(layer) {
        const currentLayout = getPropValue(layer.feature, 'Layoutname');
        const currentPropNo = getPropValue(layer.feature, 'Property_N');
        
        if (currentLayout === layoutSel.value && currentPropNo) {
            if (currentPropNo.toString().toLowerCase() === query) {
                matchLayer = layer;
            }
        }
    });

    if (matchLayer) {
        const center = matchLayer.getBounds().getCenter();
        const props = matchLayer.feature.properties;
        
        geojsonLayer.resetStyle();
        map.setView(center, 19);
        matchLayer.setStyle({ weight: 5, color: '#FFD700', fillOpacity: 0.6 }); 

        showPropertyDetails(props, center);
    } else {
        alert(`Property number "${propertyInput.value}" could not be found within ${layoutSel.value}.`);
    }
}

// 6. Custom Styled Info Panel with Universal Navigation Mapping Engine
function showPropertyDetails(props, center) {
    let infoPanel = document.getElementById('propertyInfoPanel');
    if (!infoPanel) {
        infoPanel = document.createElement('div');
        infoPanel.id = 'propertyInfoPanel';
        infoPanel.className = 'info-panel-card';
        document.body.appendChild(infoPanel);
    }

    // Dummy wrapping layer container for helper extraction compatibility
    const dummyFeature = { properties: props };

    // Case-Insensitive safe values extraction engine matrix
    const propNo = getPropValue(dummyFeature, 'Property_N') || 'N/A';
    const category = getPropValue(dummyFeature, 'Category') || 'N/A';
    const sector = getPropValue(dummyFeature, 'Sector') || 'N/A';
    const layoutName = getPropValue(dummyFeature, 'Layoutname') || 'N/A';
    const taluk = getPropValue(dummyFeature, 'Taluk') || 'N/A';
    const district = getPropValue(dummyFeature, 'District') || 'N/A';
    const area = getPropValue(dummyFeature, 'Area_in_m');
    const owner = getPropValue(dummyFeature, 'Owner_Name');
    const status = getPropValue(dummyFeature, 'Plot_Statu');

    // Extract custom coordinates or fall back to geometry bounding midpoints safely
    const finalLat = getPropValue(dummyFeature, 'Latitude') || center.lat;
    const finalLng = getPropValue(dummyFeature, 'Longitude') || center.lng;

    // Fixed Google Maps Universal Deep Link String Interpolation syntax
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${finalLat},${finalLng}`;

    // Track active target selection key on panel tracking instance
    infoPanel.setAttribute('data-active-prop', propNo);

    infoPanel.innerHTML = `
        <div class="panel-header">
            <h3>Property Data Matrix</h3>
            <button onclick="clearInfoPanel()">✕</button>
        </div>
        <div class="panel-body">
            <table class="details-table">
                <tr><th>Property No</th><td><strong class="highlight">${propNo}</strong></td></tr>
                <tr><th>Category</th><td>${category}</td></tr>
                <tr><th>Sector</th><td>${props.Sector || sector}</td></tr>
                <tr><th>Layout Name</th><td>${layoutName}</td></tr>
                <tr><th>Taluk Location</th><td>${taluk}</td></tr>
                <tr><th>District</th><td>${district}</td></tr>
                ${area ? `<tr><th>Area</th><td>${area} sq.m</td></tr>` : ''}
                ${owner ? `<tr><th>Owner Name</th><td>${owner}</td></tr>` : ''}
                ${status ? `<tr><th>Status</th><td><span class="status-tag">${status}</span></td></tr>` : ''}
            </table>
            <a href="${googleMapsUrl}" target="_blank" class="btn-navigate">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                    <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                </svg>
                Navigate in Google Maps
            </a>
        </div>
    `;
    infoPanel.classList.add('visible');
}

function clearInfoPanel() {
    const infoPanel = document.getElementById('propertyInfoPanel');
    if (infoPanel) {
        infoPanel.classList.remove('visible');
        infoPanel.removeAttribute('data-active-prop');
    }
    if (geojsonLayer) {
        geojsonLayer.resetStyle();
    }
}

// Reset Button Interface Elements Configuration Matrix
document.getElementById('btnReset').addEventListener('click', function() {
    districtSel.value = "";
    talukSel.innerHTML = '<option value="">Select Taluk</option>';
    layoutSel.innerHTML = '<option value="">Select Layout</option>';
    talukSel.disabled = true; 
    layoutSel.disabled = true;
    propertyInput.value = "";
    propertyInput.disabled = true;
    btnSearch.disabled = true;
    clearInfoPanel();
    
    if (geojsonLayer && geojsonLayer.getBounds().isValid()) {
        map.fitBounds(geojsonLayer.getBounds());
    }
});
