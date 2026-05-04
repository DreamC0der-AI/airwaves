export interface Place {
  id: string;
  title: string;
  country: string;
  url: string;
  size: number;
  geo: [number, number]; // [lng, lat]
}

export interface SearchResult {
  hits: {
    hits: Array<{
      _source: {
        title: string;
        url: string;
        type: "place" | "channel" | "country";
        subtitle?: string;
      };
    }>;
  };
}

export interface Station {
  href: string;
  title: string;
  subtitle?: string;
  page?: {
    url: string;
    title: string;
  };
}

export interface PlacePage {
  title: string;
  subtitle: string;
  url: string;
  content: Array<{
    itemsType: string;
    title: string;
    items: Station[];
    type: string;
  }>;
}
