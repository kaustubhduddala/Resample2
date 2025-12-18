import { getYtDlpInstance } from './ytdlp-service.js';
import https from 'node:https';

// --- Main Export ---

export async function getSpotifyTrackAndYouTubeUrl(spotifyUrl: string) {
  // 1. Get Metadata (Title/Artist) using the "Next.js Data" Strategy
  const spotifyInfo = await getSpotifyTrackInfo(spotifyUrl);
  
  if (!spotifyInfo.title) {
    console.error('⚠ Could not find track info.');
    return { spotifyInfo, youtubeUrl: null, youtubeVideoInfo: null };
  }
  
  // 2. Search YouTube with the full "Artist - Title" query
  const { youtubeUrl, videoInfo } = await searchYouTubeForTrack(
    spotifyInfo.title,
    spotifyInfo.artist
  );

  return { spotifyInfo, youtubeUrl, youtubeVideoInfo: videoInfo };
}

// --- Metadata Extraction ---

export async function getSpotifyTrackInfo(rawUrl: string): Promise<{
  title: string | null;
  artist: string | null;
  duration: number | null;
  thumbnail: string | null;
  album: string | null;
}> {
  const trackId = extractSpotifyId(rawUrl);
  
  if (!trackId) {
    console.error('[Spotify] Invalid URL (No Track ID found).');
    return { title: null, artist: null, duration: null, thumbnail: null, album: null };
  }

  // Use the Embed Player URL - this page contains the hidden JSON data
  const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
  console.log(`[Spotify] Scraping Embed URL: ${embedUrl}`);

  try {
    return await scrapeEmbedPage(embedUrl);
  } catch (e) {
    console.error('[Spotify] Extraction failed:', e);
    return { title: null, artist: null, duration: null, thumbnail: null, album: null };
  }
}

// --- The Fixed Scraper ---

async function scrapeEmbedPage(url: string): Promise<any> {
  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    https.get(url, options, (res) => {
      let html = '';
      res.on('data', chunk => html += chunk);
      
      res.on('end', () => {
        try {
          // TARGET: <script id="__NEXT_DATA__" type="application/json">...</script>
          // This contains the raw React props with all song data
          const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
          
          if (nextDataMatch && nextDataMatch[1]) {
            const json = JSON.parse(nextDataMatch[1]);
            
            // Navigate the JSON path observed in your source code:
            // props.pageProps.state.data.entity
            const entity = json?.props?.pageProps?.state?.data?.entity;

            if (entity) {
              const title = entity.title;
              
              // Extract artists (handle multiple artists)
              // Source: artists: [{name: "mikeeysmind"}, {name: "dadanny"}]
              let artist = null;
              if (entity.artists && Array.isArray(entity.artists)) {
                artist = entity.artists.map((a: any) => a.name).join(', ');
              }

              // Duration is in milliseconds
              const duration = entity.duration ? Math.floor(entity.duration / 1000) : null;
              
              // Thumbnail
              // Source: visualIdentity.image (array of sizes)
              let thumbnail = null;
              if (entity.visualIdentity?.image?.[0]?.url) {
                thumbnail = entity.visualIdentity.image[0].url;
              }

              console.log(`[Spotify] Extracted via JSON: "${title}" by "${artist}"`);
              
              resolve({
                title,
                artist,
                duration,
                thumbnail,
                album: null // Embed often doesn't show album name explicitly in this object
              });
              return;
            }
          }
          
          console.warn('[Spotify] __NEXT_DATA__ not found or invalid structure.');
          resolve({ title: null, artist: null, duration: null, thumbnail: null, album: null });

        } catch (e) {
          console.error('[Spotify] Parse error:', e);
          resolve({ title: null, artist: null, duration: null, thumbnail: null, album: null });
        }
      });
    }).on('error', (err) => {
      console.error('[Spotify] Request error:', err);
      resolve({ title: null, artist: null, duration: null, thumbnail: null, album: null });
    });
  });
}

// --- Helpers ---

function extractSpotifyId(url: string): string | null {
  try {
    const match = url.match(/track[\/:]([a-zA-Z0-9]{22})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// --- YouTube Search (Unchanged) ---

export async function searchYouTubeForTrack(trackTitle: string, artist?: string | null) {
  try {
    const instance = getYtDlpInstance();
    
    // Construct Query: "Artist - Title audio"
    let query = trackTitle;
    if (artist) query = `${artist} - ${trackTitle}`;
    query += " audio"; 

    console.log(`[YouTube] Searching for: "${query}"`);

    const searchResult = await instance.getInfoAsync(`ytsearch1:${query}`) as any;
    const video = searchResult.entries ? searchResult.entries[0] : searchResult;

    if (video && (video.webpage_url || video.id)) {
      const url = video.webpage_url || `https://www.youtube.com/watch?v=${video.id}`;
      console.log(`[YouTube] Found: ${url}`);
      return {
        youtubeUrl: url,
        videoInfo: {
          title: video.title,
          duration: video.duration,
          thumbnail: video.thumbnail,
          uploader: video.uploader || video.channel,
        }
      };
    }
  } catch (error) {
    console.error('[YouTube] Search failed:', error);
  }

  return { youtubeUrl: null, videoInfo: null };
}