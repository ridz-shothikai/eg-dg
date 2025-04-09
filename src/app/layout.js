import AuthProvider from "@/components/AuthProvider";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header"; // Import the new Header component
import "./globals.css";

export const metadata = {
  title: "Shothik AI – Doclyze",
  description: "AI-Powered Engineering Diagram Analysis",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {/* Removed bg-gray-900 text-white from here, moved to individual page/component bases */}
          <div className="flex h-screen"> {/* Removed base theme classes */}
            {/* Sidebar renders conditionally based on route/auth status */}
            <Sidebar />
            {/* Main content area takes remaining space - Removed w-full */}
            <div className="flex-grow flex flex-col"> {/* Wrapper for header + main content - Removed overflow-hidden */}
              {/* Header renders conditionally based on route/auth status */}
              <Header />
              {/* Ensure main content area grows and can scroll independently */}
              <main className="flex-grow overflow-y-auto"> {/* Added overflow-y-auto back */}
                {children}
              </main>
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
