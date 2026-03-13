declare module 'geojson' {
  export type Position = number[];

  export interface GeoJsonObject {
    type: string;
  }

  export interface GeoJsonProperties {
    [name: string]: unknown;
  }

  export interface Geometry extends GeoJsonObject {
    coordinates?: unknown;
  }

  export interface Feature<G extends Geometry = Geometry, P = GeoJsonProperties> extends GeoJsonObject {
    type: 'Feature';
    geometry: G;
    properties: P;
    id?: string | number;
  }

  export interface FeatureCollection<G extends Geometry = Geometry, P = GeoJsonProperties> extends GeoJsonObject {
    type: 'FeatureCollection';
    features: Array<Feature<G, P>>;
  }
}
