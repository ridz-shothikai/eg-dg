import AuthProvider from "@/components/AuthProvider";
import Sidebar from "@/components/Sidebar"; // Import the Sidebar component
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
          <div className="flex h-screen bg-gray-900 text-white"> {/* Moved base theme here */}
            <Sidebar /> {/* Sidebar will handle its own visibility based on auth */}
            <main className="flex-grow overflow-y-auto"> {/* Main content area */}
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
