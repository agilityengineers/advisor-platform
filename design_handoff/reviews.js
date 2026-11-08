// Shared review data — the CRM admin edits this list; the landing page reads it.
// In production this is the `reviews` table; `visible:false` hides without deleting.
export const REVIEWS = [
  { id: 1, visible: true, category: "Consultant", name: "Adele Farina", role: "Senior Director, Global Events & Field Marketing", linkedin: "linkedin.com/in/adelefarina", date: "Oct 6, 2026",
    quote: "In a single one-hour conversation, Brian changed that. Through precise, well-chosen questions, he drew out the full scope of my experience and the depth of what I had delivered. This brand voice now directly informs my LinkedIn profile, my website, and my conversations with prospective business partners." },
  { id: 2, visible: true, category: "Author", name: "Ken Somers", role: "Author, “Transforming Performance Management”", linkedin: "linkedin.com/in/kensomers", date: "Aug 20, 2026",
    quote: "It is astounding what a 1-hour interview can deliver in terms of defining a voice for my brand. I recommend the process for anyone seeking to more clearly define their go-to-market offerings." },
  { id: 3, visible: true, category: "Author", name: "Troy Heiner", role: "Amazon #1 Best-Selling Author, Pinnacle Pivot", linkedin: "linkedin.com/in/troyheiner", date: "May 28, 2026",
    quote: "Brian's depth of knowledge and attention to detail helped us develop a deeply rich picture of our ideal client profile and our unique value proposition. It will help us land more clients and establish strategic partnerships." },
  { id: 4, visible: true, category: "Consultant", name: "Jason Hinton", role: "Executive Alignment & Strategic AI Adoption", linkedin: "linkedin.com/in/jasonhinton", date: "Nov 6, 2025",
    quote: "In just one hour, Brian's coaching unlocked actionable strategies for leveraging my brand voice to create meaningful impact and stronger connections with my audience." },
  { id: 5, visible: true, category: "Consultant", name: "Jennifer Eichenberg", role: "Founder, Eichenberg & Associates · Prosci® Certified", linkedin: "linkedin.com/in/jennifereichenberg", date: "Aug 31, 2025",
    quote: "Our brand voice session felt more like an engaging conversation about my business than a formal consultation. He translated those insights into practical, actionable recommendations for marketing and positioning." },
  { id: 6, visible: true, category: "Consultant", name: "Jamey Lutz", role: "Customer Experience & Culture Transformation Expert", linkedin: "linkedin.com/in/jameylutz", date: "Sep 26, 2025",
    quote: "His insights in helping me explore and articulate my unique brand voice have been instrumental to the growth of my consulting business. Our collaboration has never felt transactional. I give Brian a full 5 stars." },
  { id: 7, visible: false, category: "Consultant", name: "David Shavzin", role: "Business Exit Strategist · M&A Advisor · Vistage Member", linkedin: "linkedin.com/in/davidshavzin", date: "Feb 24, 2026",
    quote: "Detaching from the day-to-day to focus on Brian's thoughtful brand questions and the resulting brand blueprint helped me get things in focus as I plan some refocusing." }
];

export const initials = (name) => name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
