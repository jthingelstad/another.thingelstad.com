export default {
  // This site's id in sites.json; the sites strip marks it as the current site.
  id: "another",
  title: "Another Thing",
  tagline: "A podcast by Jamie Thingelstad",
  description:
    "From the author of the Weekly Thing, Another Thing is where ideas grow into conversations: reflections on technology, creativity, and the things that make life interesting.",
  shortDescription:
    "A podcast by Jamie Thingelstad, exploring technology, creativity, and the things that make life interesting.",
  url: "https://another.thingelstad.com",
  language: "en-us",
  author: {
    name: "Jamie Thingelstad",
    email: "jamie@thingelstad.com",
    url: "https://www.thingelstad.com",
  },
  copyright: `© ${new Date().getFullYear()} Jamie Thingelstad`,
  coverImage: "/uploads/2025/another-thing-3000.png",
  itunes: {
    category: "Society & Culture",
    subcategory: "Personal Journals",
    type: "episodic",
    explicit: false,
  },
  subscribe: [
    {
      name: "Apple Podcasts",
      url: "https://podcasts.apple.com/us/podcast/another-thing/id1849923890",
    },
    {
      name: "Spotify",
      url: "https://open.spotify.com/show/4xWUS5KWelgIkKJoogERDL",
    },
    {
      name: "Overcast",
      url: "https://overcast.fm/itunes1849923890",
    },
    {
      name: "Pocket Casts",
      url: "https://pca.st/itunes/1849923890",
    },
    {
      name: "RSS",
      url: "https://another.thingelstad.com/podcast.xml",
    },
  ],
};
