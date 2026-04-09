// Social Sentiment - Reddit + Bluesky analysis for geopolitical/market topics
// Based on Crucix reddit and bluesky sources

import { createCircuitBreaker } from '@/utils';
import { isFeatureAvailable } from './runtime-config';

const REDDIT_API = 'https://www.reddit.com';
const BLUESKY_API = 'https://api.bsky.app';

export interface SocialPost {
  id: string;
  platform: 'reddit' | 'bluesky';
  author: string;
  text: string;
  url: string;
  likes: number;
  reposts: number;
  timestamp: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  topics: string[];
}

export interface SentimentData {
  posts: SocialPost[];
  totalPosts: number;
  sentimentBreakdown: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  topTopics: string[];
  lastUpdate: string;
  engagement: {
    totalLikes: number;
    totalReposts: number;
  };
}

const MONITORED_SUBREDDITS = [
  'worldnews', 'geopolitics', 'news', 'stocks', 'investing',
  'CryptoCurrency', 'Bitcoin', 'economy', 'politics'
];

const TRENDING_KEYWORDS = [
  'russia', 'ukraine', 'china', 'iran', 'israel', 'nato',
  'oil', 'gold', 'dollar', 'inflation', 'recession',
  'sanctions', 'military', 'war', 'peace'
];

const breaker = createCircuitBreaker<SentimentData>({ name: 'Social Sentiment' });

function analyzeSentiment(text: string): 'bullish' | 'bearish' | 'neutral' {
  const lower = text.toLowerCase();
  const bullish = ['moon', 'bull', 'buy', 'long', 'gain', 'pump', 'up', 'rise'];
  const bearish = ['dump', 'bear', 'sell', 'short', 'drop', 'fall', 'crash', 'down'];
  
  const bCount = bullish.filter(w => lower.includes(w)).length;
  const rCount = bearish.filter(w => lower.includes(w)).length;
  
  if (bCount > rCount) return 'bullish';
  if (rCount > bCount) return 'bearish';
  return 'neutral';
}

async function fetchReddit(): Promise<SocialPost[]> {
  try {
    const posts: SocialPost[] = [];
    const subreddit = MONITORED_SUBREDDITS[0];
    
    const resp = await fetch(
      `${REDDIT_API}/r/${subreddit}/hot.json?limit=25`,
      { headers: { 'User-Agent': 'GlobalIntel/1.0' } }
    );
    const data = await resp.json();
    
    (data.data?.children || []).forEach((p: any) => {
      const post = p.data;
      posts.push({
        id: post.id,
        platform: 'reddit',
        author: post.author,
        text: post.title + ' ' + (post.selftext || ''),
        url: post.url,
        likes: post.score || 0,
        reposts: post.num_comments || 0,
        timestamp: new Date(post.created_utc * 1000).toISOString(),
        sentiment: analyzeSentiment(post.title),
        topics: TRENDING_KEYWORDS.filter(k => 
          post.title.toLowerCase().includes(k)
        ),
      });
    });
    
    return posts;
  } catch {
    return [];
  }
}

async function fetchBluesky(): Promise<SocialPost[]> {
  try {
    const posts: SocialPost[] = [];
    const keyword = TRENDING_KEYWORDS[0];
    
    const resp = await fetch(
      `${BLUESKY_API}/xprs.app.bsky.feed.searchPosts?q=${keyword}&limit=25`
    );
    const data = await resp.json();
    
    (data.posts || []).forEach((p: any) => {
      const post = p.post;
      posts.push({
        id: post.uri,
        platform: 'bluesky',
        author: post.author.handle,
        text: post.record?.text || '',
        url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
        likes: post.likeCount || 0,
        reposts: post.repostCount || 0,
        timestamp: post.indexedAt,
        sentiment: analyzeSentiment(post.record?.text || ''),
        topics: TRENDING_KEYWORDS.filter(k => 
          (post.record?.text || '').toLowerCase().includes(k)
        ),
      });
    });
    
    return posts;
  } catch {
    return [];
  }
}

export async function fetchSentimentData(): Promise<SentimentData> {
  const [reddit, bluesky] = await Promise.all([fetchReddit(), fetchBluesky()]);
  const allPosts = [...reddit, ...bluesky];
  
  const sentimentBreakdown = {
    bullish: allPosts.filter(p => p.sentiment === 'bullish').length,
    bearish: allPosts.filter(p => p.sentiment === 'bearish').length,
    neutral: allPosts.filter(p => p.sentiment === 'neutral').length,
  };
  
  const topicCounts: Record<string, number> = {};
  allPosts.forEach(p => {
    p.topics.forEach(t => {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    });
  });
  
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t);
  
  return {
    posts: allPosts,
    totalPosts: allPosts.length,
    sentimentBreakdown,
    topTopics,
    lastUpdate: new Date().toISOString(),
    engagement: {
      totalLikes: allPosts.reduce((a, p) => a + p.likes, 0),
      totalReposts: allPosts.reduce((a, p) => a + p.reposts, 0),
    },
  };
}

export function isSentimentConfigured(): boolean {
  return isFeatureAvailable('socialSentiment');
}
