import { DateTime } from "luxon";
import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

function toDateTime(value) {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value, { zone: "utc" });
  }
  if (typeof value === "number") {
    return DateTime.fromMillis(value, { zone: "utc" });
  }
  return DateTime.fromJSDate(new Date(value), { zone: "utc" });
}

function xmlEscape(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default function (eleventyConfig) {
  // Static assets
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy({ uploads: "uploads" });
  eleventyConfig.addPassthroughCopy({ CNAME: "CNAME" });

  // Let Eleventy treat .txt templates (robots.txt) as pass-through templates
  // so the frontmatter-driven permalink is honored without a template engine.
  eleventyConfig.addTemplateFormats("txt");
  eleventyConfig.addExtension("txt", {
    outputFileExtension: "txt",
    compile: async function (inputContent) {
      return async () => inputContent;
    },
  });

  // --- Date filters -------------------------------------------------------

  eleventyConfig.addFilter("readableDate", (value, format = "LLLL d, yyyy") => {
    return toDateTime(value).toFormat(format);
  });

  eleventyConfig.addFilter("isoDate", (value) => {
    return toDateTime(value).toISO();
  });

  eleventyConfig.addFilter("rfc822Date", (value) => {
    return toDateTime(value).toFormat("EEE, dd LLL yyyy HH:mm:ss 'GMT'");
  });

  // --- Duration filters ---------------------------------------------------

  eleventyConfig.addFilter("hms", (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  });

  eleventyConfig.addFilter("hmsLong", (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  });

  eleventyConfig.addFilter("friendlyDuration", (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.round((total % 3600) / 60);
    if (h > 0) return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
    return `${m} min`;
  });

  // --- Text filters -------------------------------------------------------

  eleventyConfig.addFilter("xmlEscape", xmlEscape);

  eleventyConfig.addFilter("cdata", (str) => {
    const safe = String(str ?? "").replace(/]]>/g, "]]]]><![CDATA[>");
    return `<![CDATA[${safe}]]>`;
  });

  eleventyConfig.addFilter("renderMarkdown", (str) => {
    return markdown.render(String(str ?? ""));
  });

  eleventyConfig.addFilter("paragraphs", (str) => {
    const text = String(str ?? "").trim();
    if (!text) return "";
    return text
      .split(/\n\s*\n/)
      .map((block) => `<p>${xmlEscape(block.trim())}</p>`)
      .join("\n");
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html", "11ty.js"],
  };
}
