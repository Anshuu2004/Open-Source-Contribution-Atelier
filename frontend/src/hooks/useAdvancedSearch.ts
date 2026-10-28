import { useState, useCallback, useRef } from "react";
import { fetchApi } from "../lib/api";

export interface AdvancedSearchResult {
  id: string | number;
  title: string;
  description: string;
  content_type?: string;
  relevance_score?: number;
  semantic_score?: number;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * Raw item from GET /search/. The generated schema (SearchDocument) lags the
 * real payload, which can also carry rank/headline/pk/summary, so this is a
 * hand-written superset with every field optional.
 */
export interface RawSearchItem {
  id?: string | number;
  pk?: string | number;
  title?: string;
  headline?: string;
  description?: string;
  body?: string;
  summary?: string;
  content_type?: string;
  type?: string;
  rank?: number;
  relevance_score?: number;
  semantic_score?: number;
  tags?: string[] | string;
}

export type RawSearchResponse =
  RawSearchItem[] | { count?: number; results?: RawSearchItem[] };

export interface SearchFilters {
  type?: string;
  category?: string;
}

/** Normalise the two response shapes (bare array or paginated object). */
export function extractSearchResults(
  data: RawSearchResponse | null | undefined,
): {
  items: RawSearchItem[];
  count: number | undefined;
} {
  if (Array.isArray(data)) return { items: data, count: undefined };
  return {
    items: data?.results || [],
    count: typeof data?.count === "number" ? data.count : undefined,
  };
}

export interface UseAdvancedSearchResult {
  results: AdvancedSearchResult[];
  loading: boolean;
  error: Error | null;
  total: number;
  filterSuggestions: Record<string, string[]> | null;
  relevanceScores: {
    average: number;
    high: number;
  };
  search: (query: string, filters?: SearchFilters) => Promise<void>;
  clearSearch: () => void;
}

export function useAdvancedSearch(): UseAdvancedSearchResult {
  const [results, setResults] = useState<AdvancedSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);
  const [filterSuggestions, setFilterSuggestions] = useState<Record<
    string,
    string[]
  > | null>(null);
  const [relevanceScores, setRelevanceScores] = useState({
    average: 0,
    high: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const clearSearch = useCallback(() => {
    setResults([]);
    setTotal(0);
    setError(null);
    setLoading(false);
    setFilterSuggestions(null);
    setRelevanceScores({ average: 0, high: 0 });
  }, []);

  const search = useCallback(
    async (query: string, filters: SearchFilters = {}) => {
      if (!query || query.trim().length < 2) {
        clearSearch();
        return;
      }

      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (filters.type) {
          params.append("type", filters.type);
        }
        if (filters.category) {
          params.append("category", filters.category);
        }

        const data = (await fetchApi(`/search/?${params.toString()}`, {
          signal: abortControllerRef.current.signal,
        })) as RawSearchResponse;

        const { items: rawResults, count: apiCount } =
          extractSearchResults(data);

        const mappedResults: AdvancedSearchResult[] = rawResults.map(
          (item, index) => {
            const score =
              typeof item.rank === "number"
                ? item.rank
                : (item.relevance_score ?? 0.8);
            return {
              id: item.id ?? item.pk ?? `result-${index}`,
              title: item.title || item.headline || "Untitled",
              description: item.description || item.body || item.summary || "",
              content_type: item.content_type || item.type || "lesson",
              relevance_score: score,
              semantic_score: item.semantic_score ?? undefined,
              tags: Array.isArray(item.tags) ? item.tags : [],
              ...item,
            } as AdvancedSearchResult;
          },
        );

        setResults(mappedResults);
        setTotal(apiCount ?? mappedResults.length);

        // Compute relevance stats
        if (mappedResults.length > 0) {
          const scores = mappedResults.map((r) => r.relevance_score || 0);
          const avg = scores.reduce((acc, s) => acc + s, 0) / scores.length;
          const highCount = scores.filter((s) => s >= 0.7).length;
          setRelevanceScores({ average: avg, high: highCount });
        } else {
          setRelevanceScores({ average: 0, high: 0 });
        }
      } catch (err: unknown) {
        const e = err as { name?: string; code?: string } | null;
        if (e?.name === "AbortError" || e?.code === "ERR_CANCELED") {
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [clearSearch],
  );

  return {
    results,
    loading,
    error,
    total,
    filterSuggestions,
    relevanceScores,
    search,
    clearSearch,
  };
}
