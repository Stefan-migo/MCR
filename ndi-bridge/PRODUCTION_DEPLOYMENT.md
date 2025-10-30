# Production Deployment Guide

## Prerequisites

- Docker 20.10+
- Docker Compose 1.29+
- NDI SDK installed on host (for ndi-python method)
- Minimum 4 CPU cores
- 8GB RAM
- Gigabit network

## Environment Configuration

Create `.env` file:

```bash
PUBLIC_IP=your.public.ip.address
MEDIASOUP_ANNOUNCED_IP=your.public.ip.address
BACKEND_URL=https://your.domain.com:3001
LOG_LEVEL=INFO
```

## Deployment Steps

1. **Build images:**
```bash
docker-compose build --no-cache
```

2. **Start services:**
```bash
docker-compose up -d
```

3. **Verify health:**
```bash
curl http://localhost:8000/health/detailed
```

4. **Monitor logs:**
```bash
docker-compose logs -f ndi-bridge
```

## Monitoring

- Prometheus metrics: http://localhost:9090/metrics
- Health endpoint: http://localhost:8000/health/detailed
- Stream stats: http://localhost:8000/streams

## Troubleshooting

### No NDI sources visible in OBS

1. Check NDI bridge logs:
```bash
docker-compose logs ndi-bridge | grep NDI
```

2. Verify NDI SDK installed:
```bash
docker-compose exec ndi-bridge python -c "import NDIlib as ndi; print('OK')"
```

3. Check network connectivity:
```bash
docker-compose exec ndi-bridge ping backend
```

### High latency

1. Check CPU usage:
```bash
docker stats
```

2. Review frame processing metrics:
```bash
curl http://localhost:8000/stats
```

3. Verify UDP ports not blocked:
```bash
sudo netstat -tulpn | grep 20000
```

### Stream not starting

1. Check backend logs:
```bash
docker-compose logs backend
```

2. Verify PlainTransport creation:
```bash
curl http://localhost:3001/api/plain-transports
```

3. Check RTP reception:
```bash
docker-compose logs ndi-bridge | grep "RTP reception"
```

## Performance Tuning

### CPU Optimization
- Set process priority: `nice -n -10 docker-compose up`
- Use CPU affinity: `taskset -c 0-3 docker-compose up`

### Memory Optimization
- Increase shared memory: `--shm-size=2g`
- Monitor memory usage: `docker stats`

### Network Optimization
- Use dedicated network interface
- Enable UDP buffer tuning:
```bash
echo 'net.core.rmem_max = 16777216' >> /etc/sysctl.conf
echo 'net.core.rmem_default = 16777216' >> /etc/sysctl.conf
sysctl -p
```

## Security Considerations

1. **Firewall Configuration:**
```bash
# Allow only necessary ports
ufw allow 3000/tcp  # Frontend
ufw allow 3001/tcp  # Backend
ufw allow 8000/tcp  # NDI Bridge API
ufw allow 9090/tcp  # Prometheus metrics
ufw allow 20000:20100/udp  # PlainTransport ports
```

2. **SSL/TLS:**
- Use reverse proxy (nginx) for HTTPS
- Configure proper certificates
- Enable HSTS headers

3. **Access Control:**
- Restrict API access by IP
- Use authentication for admin endpoints
- Monitor access logs

## Backup and Recovery

### Configuration Backup
```bash
# Backup configuration
tar -czf config-backup.tar.gz .env docker-compose.yml

# Backup logs
tar -czf logs-backup.tar.gz ./ndi-bridge/logs/
```

### Recovery Procedure
1. Restore configuration files
2. Rebuild containers: `docker-compose build --no-cache`
3. Start services: `docker-compose up -d`
4. Verify health: `curl http://localhost:8000/health/detailed`

## Scaling

### Horizontal Scaling
- Use load balancer for multiple backend instances
- Implement Redis for session sharing
- Use external database for stream metadata

### Vertical Scaling
- Increase CPU cores and RAM
- Use SSD storage for better I/O
- Optimize Docker resource limits

## Maintenance

### Regular Tasks
- Monitor disk space: `df -h`
- Check container health: `docker-compose ps`
- Review logs for errors: `docker-compose logs --tail=100`

### Updates
1. Pull latest changes: `git pull`
2. Rebuild containers: `docker-compose build --no-cache`
3. Restart services: `docker-compose restart`
4. Verify functionality: `curl http://localhost:8000/health/detailed`

## Support

For issues and support:
1. Check logs: `docker-compose logs -f`
2. Verify configuration: `curl http://localhost:8000/config`
3. Test connectivity: `curl http://localhost:8000/health/detailed`
4. Review metrics: `curl http://localhost:9090/metrics`
