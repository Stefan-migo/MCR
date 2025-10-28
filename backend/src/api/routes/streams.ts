import { Router } from 'express';
import { MediasoupRouter, StreamInfo } from '../../mediasoup/router';

const router = Router();

// Store reference to mediasoup router (will be injected)
let mediasoupRouter: MediasoupRouter | null = null;

export function setMediasoupRouter(router: MediasoupRouter) {
  mediasoupRouter = router;
}

// GET /api/streams - Get all active streams
router.get('/', (req, res) => {
  try {
    if (!mediasoupRouter) {
      return res.status(500).json({ error: 'Media router not initialized' });
    }

    const streams = mediasoupRouter.getActiveStreams();
    res.json({ streams });
  } catch (error) {
    console.error('Error getting streams:', error);
    res.status(500).json({ error: 'Failed to get streams' });
  }
});

// GET /api/streams/:id - Get specific stream details
router.get('/:id', (req, res) => {
  try {
    if (!mediasoupRouter) {
      return res.status(500).json({ error: 'Media router not initialized' });
    }

    const { id } = req.params;
    const stream = mediasoupRouter.getStreamById(id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    res.json({ stream });
  } catch (error) {
    console.error('Error getting stream:', error);
    res.status(500).json({ error: 'Failed to get stream' });
  }
});

// PUT /api/streams/:id/name - Update stream name
router.put('/:id/name', (req, res) => {
  try {
    if (!mediasoupRouter) {
      return res.status(500).json({ error: 'Media router not initialized' });
    }

    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required and must be a string' });
    }

    const success = mediasoupRouter.updateStreamName(id, name);
    
    if (!success) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    res.json({ success: true, message: 'Stream name updated' });
  } catch (error) {
    console.error('Error updating stream name:', error);
    res.status(500).json({ error: 'Failed to update stream name' });
  }
});

// DELETE /api/streams/:id - Disconnect stream
router.delete('/:id', async (req, res) => {
  try {
    if (!mediasoupRouter) {
      return res.status(500).json({ error: 'Media router not initialized' });
    }

    const { id } = req.params;
    const success = await mediasoupRouter.disconnectStream(id);

    if (!success) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    res.json({ success: true, message: 'Stream disconnected' });
  } catch (error) {
    console.error('Error disconnecting stream:', error);
    res.status(500).json({ error: 'Failed to disconnect stream' });
  }
});

// GET /api/streams/:id/stats - Get stream statistics
router.get('/:id/stats', (req, res) => {
  try {
    if (!mediasoupRouter) {
      return res.status(500).json({ error: 'Media router not initialized' });
    }

    const { id } = req.params;
    const stream = mediasoupRouter.getStreamById(id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    res.json({ stats: stream.stats });
  } catch (error) {
    console.error('Error getting stream stats:', error);
    res.status(500).json({ error: 'Failed to get stream stats' });
  }
});

export default router;

