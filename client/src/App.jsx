import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Finder from './pages/Finder.jsx';
import Atlas from './pages/Atlas.jsx';
import Method from './pages/Method.jsx';
import Lost from './pages/Lost.jsx';
import Families from './pages/Families.jsx';
import Library from './pages/Library.jsx';
import About from './pages/About.jsx';
import Submit from './pages/Submit.jsx';
import Calculators from './pages/Calculators.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/find" element={<Finder />} />
        <Route path="/methods" element={<Atlas />} />
        <Route path="/methods/:id" element={<Method />} />
        <Route path="/lost" element={<Lost />} />
        <Route path="/families" element={<Families />} />
        <Route path="/library" element={<Library />} />
        <Route path="/calculators" element={<Calculators />} />
        <Route path="/calculators/:calc" element={<Calculators />} />
        <Route path="/submit" element={<Submit />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<div className="section"><div className="wrap"><h1 className="h1">Not found</h1><p className="lede">That page does not exist.</p></div></div>} />
      </Routes>
    </Layout>
  );
}
