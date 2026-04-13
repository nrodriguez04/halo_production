'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import MapGL, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { apiFetch } from '@/lib/api-fetch';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';

interface PropertyPin {
  id: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  state: string;
  estimatedValue?: number;
  status?: string;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const TILE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export default function PropertyMap() {
  const [properties, setProperties] = useState<PropertyPin[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<PropertyPin | null>(null);
  const [cityFilter, setCityFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewState, setViewState] = useState({
    latitude: 39.8283,
    longitude: -98.5795,
    zoom: 4,
  });

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cityFilter) params.set('city', cityFilter);
      if (stateFilter) params.set('state', stateFilter);
      const res = await apiFetch(`/properties/map?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProperties(data);
        if (data.length > 0) {
          const avgLat = data.reduce((s: number, p: PropertyPin) => s + p.latitude, 0) / data.length;
          const avgLng = data.reduce((s: number, p: PropertyPin) => s + p.longitude, 0) / data.length;
          setViewState((v) => ({ ...v, latitude: avgLat, longitude: avgLng, zoom: data.length === 1 ? 14 : 8 }));
        }
      }
    } catch (e) {
      console.error('Failed to fetch property pins:', e);
    } finally {
      setLoading(false);
    }
  }, [cityFilter, stateFilter]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Property Map</CardTitle>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Filter by city..."
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="h-8 w-24 text-sm"
            >
              <option value="">All States</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
            {loading && <span className="text-xs text-muted-foreground">Loading...</span>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[420px] w-full">
          <MapGL
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            mapStyle={TILE_URL}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />

            {properties.map((p) => (
              <Marker
                key={p.id}
                latitude={p.latitude}
                longitude={p.longitude}
                anchor="bottom"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelectedProperty(p);
                }}
              >
                <MapPin
                  size={24}
                  className="text-primary drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                  fill="hsl(142 71% 45% / 0.3)"
                />
              </Marker>
            ))}

            {selectedProperty && (
              <Popup
                latitude={selectedProperty.latitude}
                longitude={selectedProperty.longitude}
                anchor="bottom"
                onClose={() => setSelectedProperty(null)}
                closeButton={false}
                className="[&_.maplibregl-popup-content]:!bg-card [&_.maplibregl-popup-content]:!text-foreground [&_.maplibregl-popup-content]:!border [&_.maplibregl-popup-content]:!border-border [&_.maplibregl-popup-content]:!rounded-lg [&_.maplibregl-popup-content]:!shadow-xl [&_.maplibregl-popup-content]:!p-3 [&_.maplibregl-popup-tip]:!border-t-card"
              >
                <div className="space-y-1 min-w-[180px]">
                  <p className="font-medium text-sm">{selectedProperty.address}</p>
                  <p className="text-xs text-muted-foreground">{selectedProperty.city}, {selectedProperty.state}</p>
                  {selectedProperty.estimatedValue && (
                    <p className="text-sm font-semibold text-primary">${selectedProperty.estimatedValue.toLocaleString()}</p>
                  )}
                  {selectedProperty.status && <Badge variant="info">{selectedProperty.status}</Badge>}
                </div>
              </Popup>
            )}
          </MapGL>
        </div>
      </CardContent>
    </Card>
  );
}
