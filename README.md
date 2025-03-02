# Safety & Security Radar Visualization

A dynamic, interactive safety and security radar visualization tool that displays geographic safety levels on a map. This project helps users understand the safety landscape around specific locations by analyzing points of interest and representing their safety and security levels in a radar-like interface.

![Safety & Security Radar Demo](https://i.ibb.co/mGQtWxm/security-radar-demo.png)

## Features

- **Interactive Radar Visualization**: View safety and security levels in different directions around a central point
- **Adjustable Parameters**: Change radar radius and number of sectors on-the-fly
- **POI Management**: Add, view, and hide points of interest on the map
- **GeoJSON Support**: Import safety data from GeoJSON files
- **Distance Indicators**: See the distance from the center to each POI
- **Centered Map Navigation**: The radar stays centered as you navigate the map
- **Sector Analysis**: Each sector displays the safety level based on contained POIs
- **Visual Color Coding**: Safety levels are color-coded from red (dangerous) to green (safe)

## Installation

Clone the repository and open the project in your local environment:

```bash
git clone https://github.com/yourusername/security-radar-visualization.git
cd security-radar-visualization

# If you have Python installed, you can run a simple HTTP server:
python -m http.server
# Then visit http://localhost:8000 in your browser
```

No build process is required as this is a client-side JavaScript application.

## Usage

1. **Adjust Radar Settings**:
   - Use the control panel on the right to set the radar radius (in meters)
   - Modify the number of sectors for more granular analysis

2. **Add Points of Interest**:
   - Click "Agregar Punto de Interés" to add custom POIs
   - Specify safety level (1-10) and description

3. **Import GeoJSON Data**:
   - Click "Cargar GeoJSON" to import geographic safety data
   - Supported features: Points, LineStrings, and Polygons

4. **View Safety Levels**:
   - Hover over sectors to see safety level details
   - Color coding indicates safety levels (red=dangerous, yellow=neutral, green=safe)

5. **Navigate the Map**:
   - Pan and zoom the map to analyze different locations
   - The radar will always stay centered on your current view

6. **Toggle POI Visibility**:
   - Use the "Ocultar POIs" button to hide or show markers
   - Radar analysis continues to work even when POIs are hidden

## Technical Details

- **Mapping Library**: [Leaflet](https://leafletjs.com/)
- **GeoJSON Processing**: Custom implementation for extracting safety data
- **Spatial Calculations**: Custom algorithms for angle, distance, and sector analysis
- **Browser Support**: Modern browsers with ES6 support

### Project Structure

```
security-radar-visualization/
├── src/
│   ├── index.js         # Main application logic
│   ├── index.html       # HTML structure and UI elements
│   ├── index.css        # Styling for the application
│   ├── index.geojson    # Sample GeoJSON data
│   └── tests/
│       └── geojson/     # Test GeoJSON files
└── index.js             # Entry point
```

## Future Plans

- Mobile application integration with magnetometer and GPS
- Backend integration with PostgreSQL + PostGIS for scalable data storage
- Multi-user support with saved profiles and locations
- Time-based safety analysis to show changes over time
- Integration with real-time safety data sources
- Migration to React/Next.js for enhanced UI capabilities
- Creating a comprehensive backend service using Supabase

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenStreetMap for map data
- Leaflet for the mapping library
- All contributors and testers who helped improve this project

---

*Note: This project is a prototype and is intended for demonstration purposes. Safety assessments should be verified through official sources.*
