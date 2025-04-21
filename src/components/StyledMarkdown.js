import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // Plugin for GitHub Flavored Markdown (tables, etc.)

// Custom renderers with Tailwind CSS classes
const customRenderers = {
  table: ({ node, ...props }) => (
    <div className='overflow-x-auto my-4'>
      <table
        className='min-w-full divide-y divide-gray-700 border border-gray-600'
        {...props}
      />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className='bg-gray-800' {...props} />,
  tbody: ({ node, ...props }) => (
    <tbody className='divide-y divide-gray-700 bg-gray-900' {...props} />
  ),
  tr: ({ node, ...props }) => (
    <tr className='hover:bg-gray-700/50' {...props} />
  ),
  th: ({ node, ...props }) => (
    <th
      className='px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-300'
      {...props}
    />
  ),
  td: ({ node, ...props }) => (
    <td className='px-4 py-2 text-sm text-gray-200' {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className='list-disc space-y-1 pl-6 my-2' {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className='list-decimal space-y-1 pl-6 my-2' {...props} />
  ),
  li: ({ node, ...props }) => <li className='text-gray-300' {...props} />,
  p: ({ node, ...props }) => <p className='mb-2 text-gray-200' {...props} />,
  h1: ({ node, ...props }) => (
    <h1 className='text-2xl font-bold my-3 text-white' {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className='text-xl font-semibold my-3 text-white' {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className='text-lg font-semibold my-2 text-white' {...props} />
  ),
  // Add other elements like code, blockquote etc. if needed
  code: ({ node, inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "");
    return !inline ? (
      <pre className='bg-gray-800 p-3 rounded-md overflow-x-auto my-2'>
        <code
          className={`language-${
            match ? match[1] : "text"
          } text-sm text-yellow-300`}
          {...props}
        >
          {String(children).replace(/\n$/, "")}
        </code>
      </pre>
    ) : (
      <code
        className='bg-gray-700 text-red-400 px-1 py-0.5 rounded text-sm'
        {...props}
      >
        {children}
      </code>
    );
  },
  blockquote: ({ node, ...props }) => (
    <blockquote
      className='border-l-4 border-gray-600 pl-4 italic text-gray-400 my-2'
      {...props}
    />
  ),
};

const StyledMarkdown = ({ content }) => {
  return (
    <ReactMarkdown
      components={customRenderers}
      remarkPlugins={[remarkGfm]} // Enable GFM plugin
    >
      {content}
    </ReactMarkdown>
  );
};

export default StyledMarkdown;
