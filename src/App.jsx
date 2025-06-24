import { BrowserRouter as Router } from 'react-router-dom';
import Home from './comps/Home/Home';
import React, { useState } from 'react';

function App() {

    return (
        <Router>
            <Home />
        </Router>
    );
}

export default App;
