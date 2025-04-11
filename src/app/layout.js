import AuthProvider from "@/components/AuthProvider";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header"; // Import the new Header component
import "./globals.css";

export const metadata = {
  title: "Engineering Insights",
  description: "AI-Powered Engineering Diagram Analysis",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {/* Add bg-gray-900 to ensure full screen dark background */}
          <div className="flex h-screen bg-gray-900">
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
